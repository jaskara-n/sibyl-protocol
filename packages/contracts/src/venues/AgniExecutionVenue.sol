// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IExecutionVenue} from "../interfaces/IExecutionVenue.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {IAgniSwapRouter} from "../interfaces/IAgniSwapRouter.sol";
import {IAgniQuoterV2} from "../interfaces/IAgniQuoterV2.sol";
import {Ownable2Step} from "../access/Ownable2Step.sol";
import {ReentrancyGuard} from "../access/ReentrancyGuard.sol";

/// @title AgniExecutionVenue
/// @notice Real SPOT execution venue that routes the vault's swaps through the
///         Agni Finance SwapRouter (a Uniswap-V3-style DEX) on Mantle Sepolia.
/// @dev Implements {IExecutionVenue}. There are NO mock fills: every open/close
///      performs a genuine `exactInputSingle` against the configured router. The
///      venue holds the bought market token between open and close and tracks a
///      per-market held balance. LONG opens a spot buy (baseAsset -> marketToken);
///      SHORT/FLAT route through {closePosition} (marketToken -> baseAsset).
///      Slippage is bounded by `minOut` and time by `deadline`, both forwarded
///      verbatim to the router.
contract AgniExecutionVenue is IExecutionVenue, Ownable2Step, ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Protocol direction enum value for LONG (Direction { FLAT=0, LONG=1, SHORT=2 }).
    uint8 internal constant LONG = 1;

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice The Agni SwapRouter all fills are routed through.
    IAgniSwapRouter public immutable router;

    /// @notice The Agni QuoterV2 used to value held positions in base-asset terms.
    IAgniQuoterV2 public immutable quoter;

    /// @notice The cash/base asset (e.g. sUSD) positions are opened with and closed back into.
    address public immutable baseAsset;

    /// @notice Per-market configuration.
    /// @param marketToken The ERC20 traded against {baseAsset} for this market.
    /// @param feeTier The Agni pool fee tier used for routing.
    /// @param configured Whether {setMarket} has been called for this market.
    struct Market {
        address marketToken;
        uint24 feeTier;
        bool configured;
    }

    /// @notice Market configuration by id.
    mapping(bytes32 marketId => Market) public markets;

    /// @notice Held marketToken balance per market (received on open, sold on close).
    mapping(bytes32 marketId => uint256) public heldBalance;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event MarketConfigured(bytes32 indexed marketId, address indexed marketToken, uint24 feeTier);
    event PositionOpened(bytes32 indexed marketId, uint256 amountIn, uint256 received);
    event PositionClosed(bytes32 indexed marketId, uint256 amountIn, uint256 received);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error ZeroAddress();
    error MarketNotConfigured(bytes32 marketId);
    error NotSpotLong();
    error ZeroAmount();
    error PastDeadline();
    error InsufficientHeld(bytes32 marketId, uint256 held, uint256 requested);
    error TransferFailed();

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @param swapRouter The Agni SwapRouter address.
    /// @param baseAsset_ The cash/base asset address.
    /// @param quoter_ The Agni QuoterV2 address.
    /// @param owner_ The initial owner (receives ownership immediately).
    constructor(address swapRouter, address baseAsset_, address quoter_, address owner_) {
        if (swapRouter == address(0) || baseAsset_ == address(0) || quoter_ == address(0)) {
            revert ZeroAddress();
        }
        router = IAgniSwapRouter(swapRouter);
        baseAsset = baseAsset_;
        quoter = IAgniQuoterV2(quoter_);

        // Ownable2Step sets owner = msg.sender; transfer to the requested owner if different.
        if (owner_ != address(0) && owner_ != msg.sender) {
            // Direct assignment is safe here: this is constructor-time bootstrapping,
            // not a live two-step handover, and avoids requiring acceptance.
            owner = owner_;
            emit OwnershipTransferred(msg.sender, owner_);
        }
    }

    /*//////////////////////////////////////////////////////////////
                                  ADMIN
    //////////////////////////////////////////////////////////////*/

    /// @notice Configure (or reconfigure) routing for a market.
    /// @param marketId The market identifier.
    /// @param marketToken The ERC20 traded against {baseAsset}.
    /// @param feeTier The Agni pool fee tier (e.g. 500, 3000, 10000).
    function setMarket(bytes32 marketId, address marketToken, uint24 feeTier) external onlyOwner {
        if (marketToken == address(0)) revert ZeroAddress();
        markets[marketId] = Market({marketToken: marketToken, feeTier: feeTier, configured: true});
        emit MarketConfigured(marketId, marketToken, feeTier);
    }

    /*//////////////////////////////////////////////////////////////
                              EXECUTION
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IExecutionVenue
    /// @dev SPOT only: only LONG opens exposure. Pulls `amountIn` of {baseAsset}
    ///      from the caller (the vault), approves the router, and swaps
    ///      baseAsset -> marketToken via `exactInputSingle`. The bought token is
    ///      held by this venue and credited to the per-market held balance.
    function openPosition(
        bytes32 marketId,
        uint8 direction,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline
    ) external nonReentrant returns (uint256 received) {
        if (direction != LONG) revert NotSpotLong();
        if (amountIn == 0) revert ZeroAmount();
        if (block.timestamp > deadline) revert PastDeadline();

        Market memory m = markets[marketId];
        if (!m.configured) revert MarketNotConfigured(marketId);

        // Pull cash from the caller (vault).
        _safeTransferFrom(baseAsset, msg.sender, address(this), amountIn);

        // Approve the router for exactly amountIn.
        _safeApprove(baseAsset, address(router), amountIn);

        received = router.exactInputSingle(
            IAgniSwapRouter.ExactInputSingleParams({
                tokenIn: baseAsset,
                tokenOut: m.marketToken,
                fee: m.feeTier,
                recipient: address(this),
                deadline: deadline,
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );

        // Clear any residual allowance defensively.
        _safeApprove(baseAsset, address(router), 0);

        heldBalance[marketId] += received;
        emit PositionOpened(marketId, amountIn, received);
    }

    /// @inheritdoc IExecutionVenue
    /// @dev Sells `amountIn` of the held marketToken back to {baseAsset} and
    ///      returns the cash to the caller (the vault).
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

        // Reduce held balance before the external call (checks-effects-interactions).
        unchecked {
            heldBalance[marketId] = held - amountIn;
        }

        _safeApprove(m.marketToken, address(router), amountIn);

        received = router.exactInputSingle(
            IAgniSwapRouter.ExactInputSingleParams({
                tokenIn: m.marketToken,
                tokenOut: baseAsset,
                fee: m.feeTier,
                recipient: address(this),
                deadline: deadline,
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );

        _safeApprove(m.marketToken, address(router), 0);

        // Return cash to the caller.
        _safeTransfer(baseAsset, msg.sender, received);
        emit PositionClosed(marketId, amountIn, received);
    }

    /// @inheritdoc IExecutionVenue
    /// @dev Values the held marketToken in {baseAsset} terms via the Agni QuoterV2.
    ///      The quoter is not a true `view` on-chain (it simulates via revert), so
    ///      this is implemented with a low-level call and falls back to the raw
    ///      held balance if the quote cannot be obtained.
    function positionValue(bytes32 marketId) external view returns (uint256) {
        uint256 held = heldBalance[marketId];
        if (held == 0) return 0;

        Market memory m = markets[marketId];
        if (!m.configured) return 0;

        bytes memory callData = abi.encodeCall(
            IAgniQuoterV2.quoteExactInputSingle,
            (
                IAgniQuoterV2.QuoteExactInputSingleParams({
                    tokenIn: m.marketToken,
                    tokenOut: baseAsset,
                    amountIn: held,
                    fee: m.feeTier,
                    sqrtPriceLimitX96: 0
                })
            )
        );

        (bool ok, bytes memory ret) = address(quoter).staticcall(callData);
        if (ok && ret.length >= 32) {
            uint256 amountOut = abi.decode(ret, (uint256));
            return amountOut;
        }

        // Fallback: held-balance estimate (1:1) when the quoter is unavailable.
        return held;
    }

    /// @inheritdoc IExecutionVenue
    /// @dev This venue is multi-market; there is no single canonical position
    ///      token, so callers must resolve the token per-market via {markets}.
    function positionToken() external pure returns (address) {
        return address(0);
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
