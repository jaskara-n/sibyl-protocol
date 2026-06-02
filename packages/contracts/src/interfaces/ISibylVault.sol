// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ISibylVault
/// @notice External ABI surface for the Sibyl ERC-4626 strategy vault.
/// @dev The vault routes idle cash into SPOT venue positions sized by the Sibyl
///      ledger's conviction index and latest consensus, NEVER using leverage or a
///      borrow path (none exists by construction). Fees are charged on NAV gains
///      above a high-water mark and split between a fee recipient and the agent
///      reward distributor. ERC-4626 entrypoints (deposit/mint/withdraw/redeem)
///      live on the {ERC4626} base.
interface ISibylVault {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when the per-market exposure cap (bps of NAV) is set.
    event MarketCapSet(bytes32 indexed marketId, uint16 bps);

    /// @notice Emitted once per market touched during a rebalance.
    event Rebalanced(
        bytes32 indexed marketId,
        uint8 direction,
        uint256 target,
        uint256 current,
        uint256 routed
    );

    /// @notice Emitted when fees are harvested above the high-water mark.
    event FeesHarvested(
        uint256 nav,
        uint256 highWaterMark,
        uint256 totalFee,
        uint256 protocolFee,
        uint256 agentFee,
        uint64 epoch
    );

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice A take rate above 100% (10_000 bps) was supplied.
    error TakeRateTooHigh(uint16 takeRateBps);
    /// @notice A per-market cap above 100% (10_000 bps) was supplied.
    error CapTooHigh(uint16 bps);
    /// @notice rebalance() received mismatched array lengths.
    error LengthMismatch();
    /// @notice rebalance() was called past the supplied deadline.
    error PastDeadline();
    /// @notice A zero address was supplied to the constructor.
    error ZeroAddress();

    /*//////////////////////////////////////////////////////////////
                                FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Set the maximum exposure for `marketId` as a fraction of NAV (bps).
    function setMarketCapBps(bytes32 marketId, uint16 bps) external;

    /// @notice Rebalance configured markets toward their conviction-weighted targets.
    /// @param marketIds Markets to rebalance (must be ledger-registered).
    /// @param minOuts Per-market slippage floor passed to the venue.
    /// @param deadline Unix timestamp after which the call reverts.
    function rebalance(bytes32[] calldata marketIds, uint256[] calldata minOuts, uint256 deadline) external;

    /// @notice Harvest fees on NAV gains above the high-water mark and fund rewards.
    function harvestFees() external;
}
