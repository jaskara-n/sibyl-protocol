// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IExecutionVenue
/// @notice SPOT-only execution surface for routing consensus into a market venue.
/// @dev No leverage and no borrow path exist by construction. A LONG opens a spot
///      buy (cash in, asset out); SHORT and FLAT both resolve to closing the spot
///      position (asset in, cash out). `direction` follows the protocol enum
///      Direction { FLAT=0, LONG=1, SHORT=2 }. All swaps are slippage-bounded by
///      `minOut` and time-bounded by `deadline`.
interface IExecutionVenue {
    /// @notice Open (or add to) a spot position for `marketId`.
    /// @dev SPOT only: LONG buys the market asset with `amountIn` cash. SHORT/FLAT
    ///      must not open exposure and are expected to route through {closePosition}.
    /// @param marketId Scoping/routing identifier for the target market.
    /// @param direction Protocol direction enum (FLAT=0, LONG=1, SHORT=2).
    /// @param amountIn Amount of input (cash) token to spend.
    /// @param minOut Minimum acceptable output, for slippage protection.
    /// @param deadline Unix timestamp after which the fill must revert.
    /// @return received Amount of output token credited to the venue position.
    function openPosition(
        bytes32 marketId,
        uint8 direction,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline
    ) external returns (uint256 received);

    /// @notice Close (or reduce) a spot position for `marketId`.
    /// @dev SPOT only: sells `amountIn` of the held market asset back to cash.
    /// @param marketId Scoping/routing identifier for the target market.
    /// @param amountIn Amount of position (asset) token to unwind.
    /// @param minOut Minimum acceptable cash output, for slippage protection.
    /// @param deadline Unix timestamp after which the fill must revert.
    /// @return received Amount of cash token returned by closing.
    function closePosition(
        bytes32 marketId,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline
    ) external returns (uint256 received);

    /// @notice Current recorded notional value of the venue position for `marketId`.
    /// @param marketId Scoping/routing identifier for the target market.
    /// @return The recorded position notional.
    function positionValue(bytes32 marketId) external view returns (uint256);

    /// @notice The position (asset) token a caller receives when opening and must
    ///         return (via allowance) when closing.
    /// @return The ERC20 position token address.
    function positionToken() external view returns (address);

    /// @notice The amount of the market (asset) token currently held by the venue
    ///         for `marketId` (received on open, sold on close).
    /// @dev Denominated in the market token, NOT in base-asset terms. Callers use
    ///      this to compute a market-token amount to pass to {closePosition}.
    /// @param marketId Scoping/routing identifier for the target market.
    /// @return The held market-token balance for the market.
    function heldBalance(bytes32 marketId) external view returns (uint256);
}
