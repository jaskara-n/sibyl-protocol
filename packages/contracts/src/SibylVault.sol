// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISibylVault} from "./interfaces/ISibylVault.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IExecutionVenue} from "./interfaces/IExecutionVenue.sol";
import {ISibylLedger} from "./interfaces/ISibylLedger.sol";
import {IRewardDistributor} from "./interfaces/IRewardDistributor.sol";
import {ERC20} from "./tokens/ERC20.sol";
import {ERC4626} from "./tokens/ERC4626.sol";
import {Ownable2Step} from "./access/Ownable2Step.sol";
import {Pausable} from "./access/Pausable.sol";
import {ReentrancyGuard} from "./access/ReentrancyGuard.sol";
import {Direction} from "./types/SibylTypes.sol";

/// @title SibylVault
/// @notice ERC-4626 strategy vault that routes idle cash into SPOT venue positions
///         sized by the Sibyl ledger's reputation-weighted conviction and the latest
///         consensus, and charges a high-water-mark performance fee split between a
///         protocol recipient and the agent reward distributor.
/// @dev SPOT only. There is NO leverage and NO borrow path anywhere by construction:
///      target exposure is a fraction of NAV (conviction share * sizeBps), and per
///      market it is additionally clamped by a NAV-relative cap. All venue routing is
///      slippage-bounded (`minOut`) and time-bounded (`deadline`).
contract SibylVault is ISibylVault, ERC4626, Ownable2Step, Pausable, ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Basis-point denominator (100% == 10_000 bps).
    uint16 internal constant BPS_DENOMINATOR = 10_000;

    /// @notice Protocol direction enum value for LONG (mirrors {Direction}).
    uint8 internal constant DIR_LONG = uint8(Direction.LONG);

    /*//////////////////////////////////////////////////////////////
                                  STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice Reputation + conviction ledger the vault reads sizing from.
    ISibylLedger public immutable ledger;
    /// @notice SPOT execution venue positions are routed through.
    IExecutionVenue public immutable venue;
    /// @notice Reward distributor funded with the agent share of harvested fees.
    IRewardDistributor public immutable rewardDistributor;
    /// @notice Recipient of the protocol share of harvested fees.
    address public feeRecipient;
    /// @notice Performance fee rate (bps) charged on NAV gains over the high-water mark.
    uint16 public takeRateBps;

    /// @notice High-water mark (NAV) above which performance fees accrue.
    uint256 public highWaterMark;

    /// @notice Per-market exposure cap as a fraction of NAV (bps).
    mapping(bytes32 marketId => uint16) public maxBps;
    /// @notice Latest recorded consensus direction per market (FLAT/LONG/SHORT).
    mapping(bytes32 marketId => uint8) public consensusDirection;
    /// @notice Latest recorded consensus size per market (bps).
    mapping(bytes32 marketId => uint16) public consensusSizeBps;

    /// @notice Markets with a configured cap (the set summed by {totalAssets}).
    bytes32[] private _configuredMarkets;
    /// @notice Whether a market is already in `_configuredMarkets`.
    mapping(bytes32 marketId => bool) private _isConfigured;

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @param asset_ Underlying cash token (ERC-4626 asset).
    /// @param ledger_ Sibyl ledger providing conviction + consensus sizing.
    /// @param venue_ SPOT execution venue.
    /// @param rewardDistributor_ Distributor funded with the agent fee share.
    /// @param feeRecipient_ Recipient of the protocol fee share.
    /// @param takeRateBps_ Performance fee rate (bps); must be <= 10_000.
    constructor(
        IERC20 asset_,
        ISibylLedger ledger_,
        IExecutionVenue venue_,
        IRewardDistributor rewardDistributor_,
        address feeRecipient_,
        uint16 takeRateBps_
    ) ERC4626(asset_, "Sibyl Vault Share", "svSIBYL") {
        if (
            address(asset_) == address(0) || address(ledger_) == address(0) || address(venue_) == address(0)
                || address(rewardDistributor_) == address(0) || feeRecipient_ == address(0)
        ) {
            revert ZeroAddress();
        }
        if (takeRateBps_ > BPS_DENOMINATOR) revert TakeRateTooHigh(takeRateBps_);

        ledger = ledger_;
        venue = venue_;
        rewardDistributor = rewardDistributor_;
        feeRecipient = feeRecipient_;
        takeRateBps = takeRateBps_;
    }

    /*//////////////////////////////////////////////////////////////
                              ERC-4626 NAV
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc ERC4626
    /// @notice NAV = idle cash held by the vault + sum of venue position values over
    ///         every configured market.
    function totalAssets() public view override returns (uint256 nav) {
        nav = _asset.balanceOf(address(this));
        bytes32[] storage markets = _configuredMarkets;
        for (uint256 i = 0; i < markets.length; i++) {
            nav += venue.positionValue(markets[i]);
        }
    }

    /*//////////////////////////////////////////////////////////////
                          ERC-4626 OVERRIDES
    //////////////////////////////////////////////////////////////*/

    /// @dev Deposits are blocked while paused and guarded against reentrancy.
    ///      Fresh capital is added to the high-water mark so it is never mistaken for
    ///      performance gain by {harvestFees}.
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal
        override
        whenNotPaused
        nonReentrant
    {
        super._deposit(caller, receiver, assets, shares);
        highWaterMark += assets;
    }

    /// @dev Withdrawals are reentrancy-guarded (allowed while paused so users can exit).
    ///      The high-water mark is lowered by the assets removed so it tracks the
    ///      capital base rather than peak NAV.
    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares)
        internal
        override
        nonReentrant
    {
        super._withdraw(caller, receiver, owner_, assets, shares);
        uint256 hwm = highWaterMark;
        highWaterMark = assets >= hwm ? 0 : hwm - assets;
    }

    /*//////////////////////////////////////////////////////////////
                              ADMIN
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc ISibylVault
    function setMarketCapBps(bytes32 marketId, uint16 bps) external onlyOwner {
        if (bps > BPS_DENOMINATOR) revert CapTooHigh(bps);
        maxBps[marketId] = bps;
        if (!_isConfigured[marketId]) {
            _isConfigured[marketId] = true;
            _configuredMarkets.push(marketId);
        }
        emit MarketCapSet(marketId, bps);
    }

    /// @notice Record the latest consensus (direction + size) for `marketId`.
    /// @dev On-chain cache of {ISibylLedger.emitConsensus} output, consumed by
    ///      {rebalance} for sizing. Owner-gated so the cache is authentic.
    function recordConsensus(bytes32 marketId, uint8 direction, uint16 sizeBps) external onlyOwner {
        consensusDirection[marketId] = direction;
        consensusSizeBps[marketId] = sizeBps;
    }

    /// @notice Update the protocol fee recipient.
    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        feeRecipient = newRecipient;
    }

    /// @notice Pause deposits + rebalances.
    function pause() external onlyOwner whenNotPaused {
        _pause();
    }

    /// @notice Resume deposits + rebalances.
    function unpause() external onlyOwner whenPaused {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                              REBALANCE
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc ISibylVault
    /// @dev For each market: target = NAV * (conviction_i / sumConviction) * (sizeBps/10000),
    ///      clamped to NAV * maxBps[marketId] / 10000 and to a non-leveraged exposure. A LONG
    ///      consensus opens/extends a SPOT position toward target via {IExecutionVenue.openPosition};
    ///      SHORT/FLAT (or an over-target position) closes via {IExecutionVenue.closePosition}.
    function rebalance(bytes32[] calldata marketIds, uint256[] calldata minOuts, uint256 deadline)
        external
        onlyOwner
        whenNotPaused
        nonReentrant
    {
        if (marketIds.length != minOuts.length) revert LengthMismatch();
        if (block.timestamp > deadline) revert PastDeadline();

        uint256 nav = totalAssets();

        // Sum of conviction weights across the requested markets (the share denominator).
        uint256 sumConviction;
        for (uint256 i = 0; i < marketIds.length; i++) {
            (uint256 w,) = ledger.convictionIndex(marketIds[i]);
            sumConviction += w;
        }

        for (uint256 i = 0; i < marketIds.length; i++) {
            _rebalanceMarket(marketIds[i], nav, sumConviction, minOuts[i], deadline);
        }
    }

    /// @dev Route a single market toward its target. Split out of {rebalance} to keep
    ///      the stack shallow.
    function _rebalanceMarket(
        bytes32 marketId,
        uint256 nav,
        uint256 sumConviction,
        uint256 minOut,
        uint256 deadline
    ) internal {
        uint256 target = _targetFor(marketId, nav, sumConviction);
        uint256 current = venue.positionValue(marketId);

        uint8 routedDir;
        uint256 routed;

        if (target > current) {
            // Increase exposure: spend idle cash to open more.
            uint256 delta = target - current;
            _asset.approve(address(venue), delta);
            routed = venue.openPosition(marketId, DIR_LONG, delta, minOut, deadline);
            routedDir = DIR_LONG;
        } else if (target < current) {
            // Decrease exposure: unwind the over-target portion back to cash.
            // `delta` is a BASE-VALUE amount; the venue closes a MARKET-TOKEN amount
            // from its own held inventory, so convert proportionally and let the
            // venue sell directly (no vault approval needed — it holds the token).
            uint256 delta = current - target;
            uint256 held = venue.heldBalance(marketId);
            uint256 closeAmt = current == 0 ? 0 : (held * delta) / current;
            if (closeAmt > 0) {
                routed = venue.closePosition(marketId, closeAmt, minOut, deadline);
            }
            routedDir = uint8(Direction.FLAT);
        }

        emit Rebalanced(marketId, routedDir, target, current, routed);
    }

    /// @dev Compute the (non-leveraged) target exposure for a market.
    function _targetFor(bytes32 marketId, uint256 nav, uint256 sumConviction)
        internal
        view
        returns (uint256 target)
    {
        // FLAT or SHORT consensus => no SPOT exposure (spot can't be short; close out).
        if (consensusDirection[marketId] != DIR_LONG) return 0;
        if (sumConviction == 0 || nav == 0) return 0;

        (uint256 conviction,) = ledger.convictionIndex(marketId);
        if (conviction == 0) return 0;

        uint256 sizeBps = consensusSizeBps[marketId];

        // target = NAV * (conviction / sumConviction) * (sizeBps / 10000)
        target = (nav * conviction * sizeBps) / (sumConviction * BPS_DENOMINATOR);

        // Enforce per-market cap (NAV-relative). 0 cap == no exposure allowed.
        uint256 cap = (nav * maxBps[marketId]) / BPS_DENOMINATOR;
        if (target > cap) target = cap;
    }

    /*//////////////////////////////////////////////////////////////
                                FEES
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc ISibylVault
    /// @dev fee = takeRateBps * (NAV - highWaterMark) when NAV exceeds the high-water mark.
    ///      Charged in cash and split: protocol share to {feeRecipient}, agent share funded
    ///      into {rewardDistributor} for the ledger's current epoch. The high-water mark is
    ///      advanced to the post-fee NAV.
    function harvestFees() external onlyOwner nonReentrant {
        uint256 nav = totalAssets();
        uint256 hwm = highWaterMark;

        if (nav <= hwm) {
            // No new gain; ratchet HWM is unchanged.
            return;
        }

        uint256 gain = nav - hwm;
        uint256 totalFee = (gain * takeRateBps) / BPS_DENOMINATOR;

        uint64 currentEpoch = ledger.epoch();

        if (totalFee > 0) {
            // Split: agent share is half (floored), protocol gets the remainder.
            uint256 agentFee = totalFee / 2;
            uint256 protocolFee = totalFee - agentFee;

            if (protocolFee > 0) {
                require(_asset.transfer(feeRecipient, protocolFee), "FEE_OUT");
            }
            if (agentFee > 0) {
                _asset.approve(address(rewardDistributor), agentFee);
                rewardDistributor.fund(currentEpoch, agentFee);
            }

            // Advance the high-water mark to the post-fee NAV.
            highWaterMark = nav - totalFee;

            emit FeesHarvested(nav, hwm, totalFee, protocolFee, agentFee, currentEpoch);
        } else {
            // Gain too small to fee; still ratchet the mark up.
            highWaterMark = nav;
            emit FeesHarvested(nav, hwm, 0, 0, 0, currentEpoch);
        }
    }
}
