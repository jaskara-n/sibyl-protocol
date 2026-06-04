// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IAgniQuoterV2
/// @notice Local interface for the Agni Finance QuoterV2 on Mantle Sepolia,
///         used to value held positions in base-asset terms.
/// @dev Mirrors Uniswap V3 `IQuoterV2.quoteExactInputSingle`. The quoter is NOT
///      a `view` function on-chain (it simulates the swap via a revert), so it is
///      only consumed off-chain / in non-view contexts; {AgniExecutionVenue}
///      treats it as `view`-compatible via a low-level staticcall fallback to a
///      held-balance estimate when the quoter call fails.
interface IAgniQuoterV2 {
    /// @notice Parameters for quoting a single-hop exact-input swap.
    /// @param tokenIn The token being sold.
    /// @param tokenOut The token being bought.
    /// @param amountIn The exact amount of `tokenIn` to quote.
    /// @param fee The pool fee tier.
    /// @param sqrtPriceLimitX96 Price limit; 0 disables the limit.
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Quotes the output of a single-hop exact-input swap.
    /// @param params The quote parameters.
    /// @return amountOut The estimated amount of `tokenOut`.
    /// @return sqrtPriceX96After The pool sqrt price after the swap.
    /// @return initializedTicksCrossed The number of initialized ticks crossed.
    /// @return gasEstimate The estimated gas for the swap.
    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        returns (
            uint256 amountOut,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        );
}
