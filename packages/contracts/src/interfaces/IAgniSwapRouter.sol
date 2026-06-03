// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IAgniSwapRouter
/// @notice Local interface for the Agni Finance SwapRouter on Mantle Sepolia
///         (a Uniswap-V3-style DEX). Only the `exactInputSingle` entrypoint used
///         by {AgniExecutionVenue} is declared.
/// @dev Agni's SwapRouter is a Uniswap V3 SwapRouter fork that retains the
///      `deadline` field in the params struct (NOT the deadline-less SwapRouter02
///      variant). The struct layout below mirrors Uniswap V3's
///      `ISwapRouter.ExactInputSingleParams`. If the live Agni deployment turns
///      out to be a SwapRouter02 (no `deadline`), the struct must be adapted and
///      the call re-encoded — this is flagged for on-chain verification at deploy.
interface IAgniSwapRouter {
    /// @notice Parameters for a single-hop exact-input swap.
    /// @param tokenIn The token being sold.
    /// @param tokenOut The token being bought.
    /// @param fee The pool fee tier (e.g. 500, 3000, 10000).
    /// @param recipient The address that receives `tokenOut`.
    /// @param deadline Unix timestamp after which the swap reverts.
    /// @param amountIn The exact amount of `tokenIn` to spend.
    /// @param amountOutMinimum The minimum acceptable `tokenOut` (slippage bound).
    /// @param sqrtPriceLimitX96 Price limit; 0 disables the limit.
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Swaps `amountIn` of `tokenIn` for as much `tokenOut` as possible.
    /// @param params The single-hop swap parameters.
    /// @return amountOut The amount of `tokenOut` received.
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}
