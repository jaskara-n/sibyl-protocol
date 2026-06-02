// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IRewardDistributor
/// @notice External ABI surface for the Sibyl agent reward distributor.
/// @dev Holds the agent share of vault fees in an ERC20 reward token and pays it
///      out per-epoch, pro-rata to an owner-defined allocation. Rewards are pull
///      based and each (epoch, agent) pair can be claimed at most once.
interface IRewardDistributor {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when the reward pool for an epoch is funded (or topped up).
    event Funded(uint64 indexed epoch, address indexed from, uint256 amount, uint256 newPool);

    /// @notice Emitted when the owner sets the allocation weights for an epoch.
    event AllocationsSet(uint64 indexed epoch, uint256 agentCount, uint256 totalWeight);

    /// @notice Emitted when an agent claims its pro-rata reward for an epoch.
    event Claimed(uint64 indexed epoch, bytes32 indexed agentId, address indexed to, uint256 amount);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice `agentIds` and `weights` arrays have differing lengths.
    error LengthMismatch();
    /// @notice The (epoch, agent) reward has already been claimed.
    error AlreadyClaimed();
    /// @notice The agent has a zero allocation for the epoch.
    error NothingToClaim();
    /// @notice The epoch reward pool is zero (not funded).
    error EpochNotFunded();

    /*//////////////////////////////////////////////////////////////
                                FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Fund the reward pool for `epoch` by pulling `amount` reward tokens.
    function fund(uint64 epoch, uint256 amount) external;

    /// @notice Set the per-agent allocation weights for `epoch`.
    function setAllocations(uint64 epoch, bytes32[] calldata agentIds, uint256[] calldata weights) external;

    /// @notice Claim the pro-rata reward for `agentId` in `epoch`.
    function claim(bytes32 agentId, uint64 epoch) external;
}
