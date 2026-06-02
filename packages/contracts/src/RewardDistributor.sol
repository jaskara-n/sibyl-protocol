// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IRewardDistributor} from "./interfaces/IRewardDistributor.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {Ownable2Step} from "./access/Ownable2Step.sol";
import {Pausable} from "./access/Pausable.sol";
import {ReentrancyGuard} from "./access/ReentrancyGuard.sol";

/// @title RewardDistributor
/// @notice Holds the agent share of vault fees in an ERC20 reward token and pays
///         it out per-epoch, pro-rata to an owner-defined allocation.
/// @dev Funding pulls tokens in; allocation weights are set by the owner; agents
///      pull their pro-rata share once per epoch. Rewards are never slashable and
///      there is no leverage/borrow path: this contract only ever distributes
///      tokens it has actually been funded with.
contract RewardDistributor is IRewardDistributor, Ownable2Step, Pausable, ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                                  STATE
    //////////////////////////////////////////////////////////////*/

    /// @notice The ERC20 token rewards are denominated in.
    IERC20 public immutable rewardToken;

    /// @notice Operator address recorded for off-chain coordination of funding.
    address public immutable operator;

    /// @notice Total reward tokens funded for an epoch.
    mapping(uint64 epoch => uint256) public epochPool;

    /// @notice Per-agent allocation weight within an epoch.
    mapping(uint64 epoch => mapping(bytes32 agentId => uint256)) public allocation;

    /// @notice Sum of all allocation weights for an epoch (the pro-rata denominator).
    mapping(uint64 epoch => uint256) public totalAllocation;

    /// @notice Whether an (epoch, agent) reward has already been claimed.
    mapping(uint64 epoch => mapping(bytes32 agentId => bool)) public claimed;

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(IERC20 rewardToken_, address operator_) {
        rewardToken = rewardToken_;
        operator = operator_;
    }

    /*//////////////////////////////////////////////////////////////
                                FUNDING
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IRewardDistributor
    function fund(uint64 epoch, uint256 amount) external nonReentrant whenNotPaused {
        // Pull collateral first so accounting can never out-run received tokens.
        rewardToken.transferFrom(msg.sender, address(this), amount);

        uint256 newPool = epochPool[epoch] + amount;
        epochPool[epoch] = newPool;

        emit Funded(epoch, msg.sender, amount, newPool);
    }

    /*//////////////////////////////////////////////////////////////
                              ALLOCATIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IRewardDistributor
    /// @dev Overwrites any previously set allocation for the epoch.
    function setAllocations(uint64 epoch, bytes32[] calldata agentIds, uint256[] calldata weights)
        external
        onlyOwner
    {
        if (agentIds.length != weights.length) revert LengthMismatch();

        uint256 total;
        for (uint256 i; i < agentIds.length; ++i) {
            allocation[epoch][agentIds[i]] = weights[i];
            total += weights[i];
        }
        totalAllocation[epoch] = total;

        emit AllocationsSet(epoch, agentIds.length, total);
    }

    /*//////////////////////////////////////////////////////////////
                                 CLAIM
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IRewardDistributor
    /// @dev share = epochPool[epoch] * allocation / sumAllocations, paid once.
    function claim(bytes32 agentId, uint64 epoch) external nonReentrant whenNotPaused {
        uint256 pool = epochPool[epoch];
        if (pool == 0) revert EpochNotFunded();

        uint256 weight = allocation[epoch][agentId];
        if (weight == 0) revert NothingToClaim();

        if (claimed[epoch][agentId]) revert AlreadyClaimed();

        // Effects before interaction (checks-effects-interactions) in addition to
        // the reentrancy guard.
        claimed[epoch][agentId] = true;

        uint256 amount = (pool * weight) / totalAllocation[epoch];

        rewardToken.transfer(msg.sender, amount);

        emit Claimed(epoch, agentId, msg.sender, amount);
    }

    /*//////////////////////////////////////////////////////////////
                              PAUSE CONTROLS
    //////////////////////////////////////////////////////////////*/

    /// @notice Pause funding/claims.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume funding/claims.
    function unpause() external onlyOwner {
        _unpause();
    }
}
