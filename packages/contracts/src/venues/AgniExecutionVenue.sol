// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IExecutionVenue} from "../interfaces/IExecutionVenue.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {IAgniSwapRouter} from "../interfaces/IAgniSwapRouter.sol";
import {IAgniV3Factory, IAgniV3Pool} from "../interfaces/IAgniV3.sol";
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

    /// @notice The Agni V3 factory used to resolve pools when valuing held positions.
    IAgniV3Factory public immutable factory;

    /// @notice Fixed-point scaling constant 2**96 used by the Q64.96 price math.
    uint256 private constant Q96 = 0x1000000000000000000000000;

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
    /// @param factory_ The Agni V3 factory address (used to resolve pools for pricing).
    /// @param owner_ The initial owner (receives ownership immediately).
    constructor(address swapRouter, address baseAsset_, address factory_, address owner_) {
        if (swapRouter == address(0) || baseAsset_ == address(0) || factory_ == address(0)) {
            revert ZeroAddress();
        }
        router = IAgniSwapRouter(swapRouter);
        baseAsset = baseAsset_;
        factory = IAgniV3Factory(factory_);

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
    /// @dev Values the held marketToken in {baseAsset} terms using the Agni V3 pool
    ///      spot price (`slot0().sqrtPriceX96`). Both tokens are assumed 18 decimals.
    ///      The price is `(token1/token0) * 2**96 == sqrtPriceX96^2 / 2**96`; the held
    ///      market token is converted to base depending on whether the base asset is
    ///      token0 or token1. All multiplications use a 512-bit {_mulDiv} so the
    ///      intermediate `sqrtPriceX96^2` and `held * priceX96` cannot overflow.
    ///
    ///      Fallback: if the pool does not exist (`getPool == address(0)`) or `slot0`
    ///      reverts, the held balance is returned 1:1 as a best-effort estimate. This
    ///      is a deliberate degradation when the venue cannot resolve a live price.
    function positionValue(bytes32 marketId) external view returns (uint256) {
        uint256 held = heldBalance[marketId];
        if (held == 0) return 0;

        Market memory m = markets[marketId];
        if (!m.configured) return 0;

        // Resolve the pool that prices marketToken against baseAsset.
        address pool = factory.getPool(baseAsset, m.marketToken, m.feeTier);
        if (pool == address(0)) return held; // fallback: no pool, value 1:1.

        // Read the current spot sqrt price; degrade to 1:1 if the read reverts.
        (bool ok, bytes memory ret) =
            pool.staticcall(abi.encodeWithSelector(IAgniV3Pool.slot0.selector));
        if (!ok || ret.length < 32) return held; // fallback: slot0 unavailable.

        uint160 sqrtPriceX96 = abi.decode(ret, (uint160));
        if (sqrtPriceX96 == 0) return held; // fallback: uninitialized pool.

        // priceX96 = (token1/token0) * 2**96, computed overflow-safe.
        uint256 priceX96 = _mulDiv(uint256(sqrtPriceX96), uint256(sqrtPriceX96), Q96);

        // Token ordering: lower address is token0.
        if (m.marketToken < baseAsset) {
            // marketToken == token0, baseAsset == token1:
            // base = held * (token1/token0) = held * priceX96 / 2**96.
            return _mulDiv(held, priceX96, Q96);
        } else {
            // baseAsset == token0, marketToken == token1:
            // base = held / (token1/token0) = held * 2**96 / priceX96.
            if (priceX96 == 0) return held; // fallback: degenerate price.
            return _mulDiv(held, Q96, priceX96);
        }
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

    /*//////////////////////////////////////////////////////////////
                              FIXED-POINT MATH
    //////////////////////////////////////////////////////////////*/

    /// @notice Calculates floor(a * b / denominator) with full 512-bit precision.
    /// @dev Uniswap-V3 `FullMath.mulDiv`: handles intermediate products that exceed
    ///      256 bits without overflow. Reverts if `denominator == 0` or the result
    ///      overflows uint256.
    /// @param a The multiplicand.
    /// @param b The multiplier.
    /// @param denominator The divisor (must be > 0).
    /// @return result floor(a * b / denominator).
    function _mulDiv(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256 result) {
        unchecked {
            // 512-bit multiply [prod1 prod0] = a * b.
            uint256 prod0; // least significant 256 bits
            uint256 prod1; // most significant 256 bits
            assembly {
                let mm := mulmod(a, b, not(0))
                prod0 := mul(a, b)
                prod1 := sub(sub(mm, prod0), lt(mm, prod0))
            }

            // Handle non-overflow case (256-bit result).
            if (prod1 == 0) {
                require(denominator > 0, "DENOM_ZERO");
                assembly {
                    result := div(prod0, denominator)
                }
                return result;
            }

            // Make sure the result fits in 256 bits.
            require(denominator > prod1, "MULDIV_OVERFLOW");

            // 512 by 256 division.
            // Subtract remainder from [prod1 prod0].
            uint256 remainder;
            assembly {
                remainder := mulmod(a, b, denominator)
                prod1 := sub(prod1, gt(remainder, prod0))
                prod0 := sub(prod0, remainder)
            }

            // Factor powers of two out of denominator.
            uint256 twos = denominator & (~denominator + 1);
            assembly {
                denominator := div(denominator, twos)
                prod0 := div(prod0, twos)
                twos := add(div(sub(0, twos), twos), 1)
            }

            // Shift in bits from prod1 into prod0.
            prod0 |= prod1 * twos;

            // Invert denominator mod 2**256.
            uint256 inv = (3 * denominator) ^ 2;
            inv *= 2 - denominator * inv; // mod 2**8
            inv *= 2 - denominator * inv; // mod 2**16
            inv *= 2 - denominator * inv; // mod 2**32
            inv *= 2 - denominator * inv; // mod 2**64
            inv *= 2 - denominator * inv; // mod 2**128
            inv *= 2 - denominator * inv; // mod 2**256

            result = prod0 * inv;
            return result;
        }
    }
}
