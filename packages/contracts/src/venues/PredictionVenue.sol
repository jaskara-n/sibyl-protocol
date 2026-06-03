// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IExecutionVenue} from "../interfaces/IExecutionVenue.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {Ownable2Step} from "../access/Ownable2Step.sol";
import {ReentrancyGuard} from "../access/ReentrancyGuard.sol";
import {SibylPredictionMarket} from "../prediction/SibylPredictionMarket.sol";
import {OutcomeFPMM} from "../prediction/OutcomeFPMM.sol";
import {OutcomeToken} from "../prediction/OutcomeToken.sol";

/// @title PredictionVenue
/// @notice {IExecutionVenue} adapter that lets the Sibyl vault trade binary
///         prediction markets through an {OutcomeFPMM}, using the same SPOT
///         open/close surface the vault uses for trading markets.
/// @dev Mapping of the SPOT semantics onto a binary market:
///
///        openPosition(LONG):  buy YES shares with `amountIn` collateral.
///        openPosition(SHORT): buy NO  shares with `amountIn` collateral.
///        openPosition(FLAT):  reverts (use {closePosition}).
///        closePosition:       sell `amountIn` of the HELD outcome shares back
///                             to the FPMM for collateral, returned to the caller.
///
///      The venue holds the outcome shares between open and close and tracks a
///      per-market held balance denominated in outcome-share units. Only ONE
///      outcome side may be held per market at a time: the side is latched on the
///      first open and may only switch once the held balance returns to zero.
///
///      `positionValue` marks the held shares to the FPMM implied price while the
///      market is UNRESOLVED, and to the prediction-market redemption value
///      (winning shares 1:1, losing shares 0, INVALID 0.5) once it is RESOLVED.
///
///      There are NO mocks: every open/close routes through the real FPMM and the
///      real {SibylPredictionMarket}. Slippage is bounded by `minOut`; `deadline`
///      is honoured by reverting once elapsed (the FPMM itself is time-agnostic).
contract PredictionVenue is IExecutionVenue, Ownable2Step, ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Protocol direction enum value for LONG (Direction { FLAT=0, LONG=1, SHORT=2 }).
    uint8 internal constant LONG = 1;
    /// @notice Protocol direction enum value for SHORT.
    uint8 internal constant SHORT = 2;

    /// @notice Fixed-point one (FPMM prices are 1e18-scaled probabilities).
    uint256 internal constant WAD = 1e18;

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Per-market configuration.
    /// @param predictionMarket The parent {SibylPredictionMarket} controller.
    /// @param fpmm The per-market {OutcomeFPMM}.
    /// @param collateral The collateral token positions open/close against.
    /// @param configured Whether {setMarket} has been called for this market.
    struct Market {
        SibylPredictionMarket predictionMarket;
        OutcomeFPMM fpmm;
        IERC20 collateral;
        bool configured;
    }

    /// @notice Market configuration by id.
    mapping(bytes32 marketId => Market) public markets;

    /// @notice Held outcome-share balance per market (received on open, sold on close).
    mapping(bytes32 marketId => uint256) public heldBalance;

    /// @notice Whether the currently-held side for a market is YES (true) or NO (false).
    /// @dev Only meaningful while `heldBalance[marketId] > 0`.
    mapping(bytes32 marketId => bool) public heldIsYes;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event MarketConfigured(
        bytes32 indexed marketId, address indexed predictionMarket, address indexed fpmm, address collateral
    );
    event PositionOpened(bytes32 indexed marketId, bool isYes, uint256 collateralIn, uint256 sharesOut);
    event PositionClosed(bytes32 indexed marketId, bool isYes, uint256 sharesIn, uint256 collateralOut);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error ZeroAddress();
    error MarketNotConfigured(bytes32 marketId);
    error NotLongOrShort();
    error ZeroAmount();
    error PastDeadline();
    error InsufficientHeld(bytes32 marketId, uint256 held, uint256 requested);
    error SideMismatch(bytes32 marketId);
    error SlippageClose(uint256 out, uint256 minOut);
    error TransferFailed();

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @param owner_ The initial owner (receives ownership immediately).
    constructor(address owner_) {
        // Ownable2Step sets owner = msg.sender; transfer to the requested owner if different.
        if (owner_ != address(0) && owner_ != msg.sender) {
            owner = owner_;
            emit OwnershipTransferred(msg.sender, owner_);
        }
    }

    /*//////////////////////////////////////////////////////////////
                                  ADMIN
    //////////////////////////////////////////////////////////////*/

    /// @notice Configure (or reconfigure) a prediction market for routing.
    /// @param marketId The market identifier (shared with the prediction market & FPMM).
    /// @param predictionMarket The parent {SibylPredictionMarket}.
    /// @param fpmm The per-market {OutcomeFPMM}.
    /// @param collateral The collateral token.
    function setMarket(bytes32 marketId, address predictionMarket, address fpmm, address collateral)
        external
        onlyOwner
    {
        if (predictionMarket == address(0) || fpmm == address(0) || collateral == address(0)) {
            revert ZeroAddress();
        }
        markets[marketId] = Market({
            predictionMarket: SibylPredictionMarket(predictionMarket),
            fpmm: OutcomeFPMM(fpmm),
            collateral: IERC20(collateral),
            configured: true
        });
        emit MarketConfigured(marketId, predictionMarket, fpmm, collateral);
    }

    /*//////////////////////////////////////////////////////////////
                              EXECUTION
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IExecutionVenue
    /// @dev LONG buys YES, SHORT buys NO. Pulls `amountIn` collateral from the
    ///      caller (the vault), approves the FPMM, and buys `outcome` shares with
    ///      slippage floor `minOut`. The shares are held by this venue. Only one
    ///      side may be held per market at a time.
    function openPosition(
        bytes32 marketId,
        uint8 direction,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline
    ) external nonReentrant returns (uint256 received) {
        if (direction != LONG && direction != SHORT) revert NotLongOrShort();
        if (amountIn == 0) revert ZeroAmount();
        if (block.timestamp > deadline) revert PastDeadline();

        Market memory m = markets[marketId];
        if (!m.configured) revert MarketNotConfigured(marketId);

        bool wantYes = direction == LONG;

        // Latch / enforce the held side: cannot mix YES and NO exposure.
        uint256 held = heldBalance[marketId];
        if (held > 0 && heldIsYes[marketId] != wantYes) revert SideMismatch(marketId);

        // Pull collateral from the caller (vault) and approve the FPMM.
        _safeTransferFrom(address(m.collateral), msg.sender, address(this), amountIn);
        _safeApprove(address(m.collateral), address(m.fpmm), amountIn);

        SibylPredictionMarket.Outcome outcome =
            wantYes ? SibylPredictionMarket.Outcome.YES : SibylPredictionMarket.Outcome.NO;
        received = m.fpmm.buy(outcome, amountIn, minOut);

        // Clear residual allowance defensively.
        _safeApprove(address(m.collateral), address(m.fpmm), 0);

        heldIsYes[marketId] = wantYes;
        heldBalance[marketId] = held + received;

        emit PositionOpened(marketId, wantYes, amountIn, received);
    }

    /// @inheritdoc IExecutionVenue
    /// @dev Sells `amountIn` of the held outcome shares back to the FPMM. The FPMM
    ///      `sell` is quoted in collateral-out terms, so we solve for the maximum
    ///      collateral the held shares buy back and verify the shares actually
    ///      consumed do not exceed `amountIn`. Collateral is returned to the caller.
    function closePosition(
        bytes32 marketId,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline
    ) external nonReentrant returns (uint256 received) {
        if (amountIn == 0) revert ZeroAmount();
        if (block.timestamp > deadline) revert PastDeadline();

        Market memory m = markets[marketId];
        if (!m.configured) revert MarketNotConfigured(marketId);

        uint256 held = heldBalance[marketId];
        if (amountIn > held) revert InsufficientHeld(marketId, held, amountIn);

        bool isYes = heldIsYes[marketId];
        SibylPredictionMarket.Outcome outcome =
            isYes ? SibylPredictionMarket.Outcome.YES : SibylPredictionMarket.Outcome.NO;
        OutcomeToken share = isYes ? m.fpmm.yes() : m.fpmm.no();

        // Find the collateral amount whose required outcome-share input equals
        // (at most) `amountIn`. The FPMM `sell` consumes calcSellAmount(out) shares
        // to release `out` collateral; that function is monotonic in `out`, so a
        // bisection gives the largest `out` consuming <= amountIn shares.
        uint256 collateralOut = _maxCollateralForShares(m.fpmm, outcome, amountIn);
        if (collateralOut < minOut) revert SlippageClose(collateralOut, minOut);
        if (collateralOut == 0) revert SlippageClose(0, minOut);

        uint256 sharesNeeded = m.fpmm.calcSellAmount(outcome, collateralOut);
        // By construction sharesNeeded <= amountIn; assert via the guard.
        if (sharesNeeded > amountIn) revert InsufficientHeld(marketId, amountIn, sharesNeeded);

        // Effects: reduce held by the shares actually consumed.
        unchecked {
            heldBalance[marketId] = held - sharesNeeded;
        }

        // Interactions: approve the FPMM to pull the shares, sell, forward collateral.
        _safeApprove(address(share), address(m.fpmm), sharesNeeded);
        uint256 spent = m.fpmm.sell(outcome, collateralOut, sharesNeeded);
        _safeApprove(address(share), address(m.fpmm), 0);

        // Defensive: the FPMM should consume exactly `sharesNeeded`.
        if (spent != sharesNeeded) revert InsufficientHeld(marketId, sharesNeeded, spent);

        received = collateralOut;
        _safeTransfer(address(m.collateral), msg.sender, received);

        emit PositionClosed(marketId, isYes, sharesNeeded, received);
    }

    /// @inheritdoc IExecutionVenue
    /// @dev If the market is RESOLVED, value the held shares at their redemption
    ///      value via the prediction market: winning side 1:1, losing side 0,
    ///      INVALID 0.5. Otherwise mark to the FPMM implied price of the held side.
    function positionValue(bytes32 marketId) external view returns (uint256) {
        uint256 held = heldBalance[marketId];
        if (held == 0) return 0;

        Market memory m = markets[marketId];
        if (!m.configured) return 0;

        bool isYes = heldIsYes[marketId];

        (, , , , , , SibylPredictionMarket.Outcome outcome, bool resolved,) =
            m.predictionMarket.markets(marketId);

        if (resolved) {
            if (outcome == SibylPredictionMarket.Outcome.INVALID) {
                return held / 2; // 0.5 collateral per share on either side.
            }
            bool win = (outcome == SibylPredictionMarket.Outcome.YES) == isYes;
            return win ? held : 0;
        }

        // Unresolved: mark to the FPMM implied price of the held side.
        uint256 price = isYes ? m.fpmm.priceYES() : m.fpmm.priceNO();
        return (held * price) / WAD;
    }

    /// @inheritdoc IExecutionVenue
    /// @dev Multi-market venue with per-market YES/NO tokens; there is no single
    ///      canonical position token. Callers resolve the held side via
    ///      {heldIsYes} and the per-market FPMM's {yes}/{no} tokens.
    function positionToken() external pure returns (address) {
        return address(0);
    }

    /*//////////////////////////////////////////////////////////////
                              VIEW HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Largest collateral-out the FPMM will release for selling at most
    ///         `maxShares` of `outcome`, found by bisection on the monotonic
    ///         {OutcomeFPMM.calcSellAmount}.
    /// @dev `calcSellAmount(out)` is strictly increasing in `out` and bounded by
    ///      the opposite reserve; we search `out` in `[0, hi)` where `hi` is just
    ///      below that reserve. Returns 0 if even the smallest unit costs more
    ///      than `maxShares`.
    function _maxCollateralForShares(OutcomeFPMM fpmm, SibylPredictionMarket.Outcome outcome, uint256 maxShares)
        internal
        view
        returns (uint256)
    {
        // Upper bound on collateralOut is strictly less than the OTHER reserve
        // (the reserve that gets drained on a sell of `outcome`).
        uint256 otherReserve = outcome == SibylPredictionMarket.Outcome.YES ? fpmm.reserveNO() : fpmm.reserveYES();
        if (otherReserve <= 1) return 0;

        uint256 lo = 0;
        uint256 hi = otherReserve - 1; // calcSellAmount requires rOther > collateralOut.

        // Quick check: if the whole hi is affordable, return it.
        if (fpmm.calcSellAmount(outcome, hi) <= maxShares) {
            return hi;
        }

        // Binary search for the largest `out` with calcSellAmount(out) <= maxShares.
        // Loop bound: ~256 iterations max; reserves are <= uint256.
        while (lo < hi) {
            uint256 mid = (lo + hi + 1) / 2;
            if (fpmm.calcSellAmount(outcome, mid) <= maxShares) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        return lo;
    }

    /*//////////////////////////////////////////////////////////////
                          SAFE ERC20 HELPERS
    //////////////////////////////////////////////////////////////*/

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) =
            token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) =
            token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _safeApprove(address token, address spender, uint256 amount) internal {
        (bool ok, bytes memory ret) =
            token.call(abi.encodeWithSelector(IERC20.approve.selector, spender, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
