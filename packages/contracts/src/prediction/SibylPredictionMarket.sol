// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "../interfaces/IERC20.sol";
import {ReentrancyGuard} from "../access/ReentrancyGuard.sol";
import {OutcomeToken} from "./OutcomeToken.sol";

/// @title SibylPredictionMarket
/// @notice Permissionless factory and lifecycle controller for binary
///         (YES/NO) prediction markets, following the Gnosis Conditional Tokens
///         complete-set pattern.
/// @dev Each market is keyed by a caller-supplied `bytes32 marketId`. Creating a
///      market deploys two {OutcomeToken} contracts (YES and NO). A complete set
///      is `amount` YES + `amount` NO, always backed 1:1 by collateral:
///
///        mintSet:   pull `amount` collateral  -> mint `amount` YES + `amount` NO
///        redeemSet: burn `amount` YES + NO     -> return `amount` collateral
///
///      After resolution, the winning side redeems 1:1; the losing side is
///      worthless. INVALID refunds both sides at 0.5 collateral per share (or the
///      holder may simply redeemSet, which remains available pre- and
///      post-resolution since it is outcome-agnostic and fully collateralised).
///
///      A prediction market is just another `marketId` in the Sibyl reputation
///      ledger; this contract is self-contained and touches no consensus state.
contract SibylPredictionMarket is ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                                  TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice Resolution state of a market.
    /// @dev UNRESOLVED is the default (zero) value before {resolve}.
    enum Outcome {
        UNRESOLVED,
        YES,
        NO,
        INVALID
    }

    /// @notice Per-market storage.
    struct Market {
        IERC20 collateral;
        OutcomeToken yes;
        OutcomeToken no;
        bytes32 questionHash;
        uint64 resolveTime;
        address resolver;
        Outcome outcome;
        bool resolved;
        bool exists;
    }

    /*//////////////////////////////////////////////////////////////
                                  STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice Market data keyed by marketId.
    mapping(bytes32 marketId => Market) public markets;

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    event MarketCreated(
        bytes32 indexed marketId,
        address indexed collateral,
        address indexed resolver,
        address yes,
        address no,
        bytes32 questionHash,
        uint64 resolveTime
    );
    event SetMinted(bytes32 indexed marketId, address indexed account, uint256 amount);
    event SetRedeemed(bytes32 indexed marketId, address indexed account, uint256 amount);
    event Resolved(bytes32 indexed marketId, Outcome outcome);
    event Redeemed(bytes32 indexed marketId, address indexed account, uint256 payout);

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    error MarketExists();
    error MarketUnknown();
    error ZeroAddress();
    error ZeroAmount();
    error ResolveTimeInPast();
    error NotResolver();
    error TooEarly();
    error AlreadyResolved();
    error NotResolved();
    error InvalidOutcome();
    error TransferFailed();
    error NothingToRedeem();

    /*//////////////////////////////////////////////////////////////
                               MARKET CREATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Create a new binary market. Permissionless: any address (including
    ///         agent wallets) may call.
    /// @param marketId Caller-chosen unique identifier for the market.
    /// @param collateral The 18-decimal ERC20 used to back complete sets.
    /// @param questionHash Hash/commitment of the market question.
    /// @param resolveTime Unix timestamp after which resolution is permitted.
    /// @param resolver Address authorized to resolve the market.
    function createMarket(
        bytes32 marketId,
        address collateral,
        bytes32 questionHash,
        uint64 resolveTime,
        address resolver
    ) external {
        if (markets[marketId].exists) revert MarketExists();
        if (collateral == address(0) || resolver == address(0)) revert ZeroAddress();
        if (resolveTime <= block.timestamp) revert ResolveTimeInPast();

        OutcomeToken yes = new OutcomeToken("Sibyl YES Outcome", "sYES");
        OutcomeToken no = new OutcomeToken("Sibyl NO Outcome", "sNO");

        markets[marketId] = Market({
            collateral: IERC20(collateral),
            yes: yes,
            no: no,
            questionHash: questionHash,
            resolveTime: resolveTime,
            resolver: resolver,
            outcome: Outcome.UNRESOLVED,
            resolved: false,
            exists: true
        });

        emit MarketCreated(
            marketId, collateral, resolver, address(yes), address(no), questionHash, resolveTime
        );
    }

    /*//////////////////////////////////////////////////////////////
                              COMPLETE SETS
    //////////////////////////////////////////////////////////////*/

    /// @notice Mint a complete set: deposit `amount` collateral, receive `amount`
    ///         YES and `amount` NO shares.
    /// @param marketId The market.
    /// @param amount The number of complete sets (collateral units) to mint.
    function mintSet(bytes32 marketId, uint256 amount) external nonReentrant {
        Market storage m = _market(marketId);
        if (amount == 0) revert ZeroAmount();

        _pull(m.collateral, msg.sender, amount);
        m.yes.mint(msg.sender, amount);
        m.no.mint(msg.sender, amount);

        emit SetMinted(marketId, msg.sender, amount);
    }

    /// @notice Redeem a complete set: burn `amount` YES and `amount` NO shares,
    ///         receive `amount` collateral back. Outcome-agnostic; available both
    ///         before and after resolution.
    /// @param marketId The market.
    /// @param amount The number of complete sets to redeem.
    function redeemSet(bytes32 marketId, uint256 amount) external nonReentrant {
        Market storage m = _market(marketId);
        if (amount == 0) revert ZeroAmount();

        m.yes.burn(msg.sender, amount);
        m.no.burn(msg.sender, amount);
        _push(m.collateral, msg.sender, amount);

        emit SetRedeemed(marketId, msg.sender, amount);
    }

    /*//////////////////////////////////////////////////////////////
                                RESOLUTION
    //////////////////////////////////////////////////////////////*/

    /// @notice Resolve a market to a final outcome. Resolver-only, only after
    ///         `resolveTime`, and only once.
    /// @param marketId The market.
    /// @param outcome The final outcome (YES, NO, or INVALID).
    function resolve(bytes32 marketId, Outcome outcome) external {
        Market storage m = _market(marketId);
        if (msg.sender != m.resolver) revert NotResolver();
        if (block.timestamp < m.resolveTime) revert TooEarly();
        if (m.resolved) revert AlreadyResolved();
        if (outcome == Outcome.UNRESOLVED) revert InvalidOutcome();

        m.outcome = outcome;
        m.resolved = true;

        emit Resolved(marketId, outcome);
    }

    /// @notice Redeem winning shares after resolution for collateral.
    /// @dev YES outcome: each YES share pays 1 collateral, NO pays 0.
    ///      NO outcome: each NO share pays 1, YES pays 0.
    ///      INVALID: each YES and each NO share pays 0.5 collateral.
    ///      Burns the caller's relevant shares and transfers the payout.
    /// @param marketId The market.
    function redeem(bytes32 marketId) external nonReentrant {
        Market storage m = _market(marketId);
        if (!m.resolved) revert NotResolved();

        uint256 yesBal = m.yes.balanceOf(msg.sender);
        uint256 noBal = m.no.balanceOf(msg.sender);
        uint256 payout;

        if (m.outcome == Outcome.YES) {
            if (yesBal > 0) {
                m.yes.burn(msg.sender, yesBal);
                payout = yesBal;
            }
        } else if (m.outcome == Outcome.NO) {
            if (noBal > 0) {
                m.no.burn(msg.sender, noBal);
                payout = noBal;
            }
        } else {
            // INVALID: 0.5 per share on each side.
            if (yesBal > 0) m.yes.burn(msg.sender, yesBal);
            if (noBal > 0) m.no.burn(msg.sender, noBal);
            payout = (yesBal + noBal) / 2;
        }

        if (payout == 0) revert NothingToRedeem();
        _push(m.collateral, msg.sender, payout);

        emit Redeemed(marketId, msg.sender, payout);
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Return the YES and NO token addresses for a market.
    function tokens(bytes32 marketId) external view returns (address yes, address no) {
        Market storage m = _market(marketId);
        return (address(m.yes), address(m.no));
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    function _market(bytes32 marketId) internal view returns (Market storage m) {
        m = markets[marketId];
        if (!m.exists) revert MarketUnknown();
    }

    /// @dev SafeERC20-style pull: tolerates non-standard (void) return values and
    ///      reverts on an explicit `false`.
    function _pull(IERC20 token, address from, uint256 amount) internal {
        _check(
            address(token),
            abi.encodeWithSelector(token.transferFrom.selector, from, address(this), amount)
        );
    }

    /// @dev SafeERC20-style push out of this contract.
    function _push(IERC20 token, address to, uint256 amount) internal {
        _check(address(token), abi.encodeWithSelector(token.transfer.selector, to, amount));
    }

    function _check(address token, bytes memory data) private {
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
