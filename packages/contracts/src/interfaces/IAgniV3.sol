// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IAgniV3Factory
/// @notice Minimal local interface for the Agni Finance V3 factory (a Uniswap-V3
///         fork) on Mantle Sepolia. Only the pool lookup read is declared.
interface IAgniV3Factory {
    /// @notice Returns the V3 pool for the (tokenA, tokenB, fee) triple, or the
    ///         zero address if no such pool exists.
    /// @param tokenA One pool token (ordering is irrelevant to the lookup).
    /// @param tokenB The other pool token.
    /// @param fee The pool fee tier.
    /// @return pool The pool address, or address(0) if none.
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

/// @title IAgniV3Pool
/// @notice Minimal local interface for an Agni Finance V3 pool. Only the `slot0`
///         spot-price read is declared.
interface IAgniV3Pool {
    /// @notice The pool's current price/oracle state.
    /// @return sqrtPriceX96 The current price as a sqrt(token1/token0) Q64.96 value.
    /// @return tick The current tick.
    /// @return observationIndex The index of the last oracle observation.
    /// @return observationCardinality The current oracle cardinality.
    /// @return observationCardinalityNext The next oracle cardinality.
    /// @return feeProtocol The protocol fee config.
    /// @return unlocked Whether the pool is currently unlocked.
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
}
