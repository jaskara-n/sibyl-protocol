// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AgentScore} from "../types/SibylTypes.sol";

/// @title IAgentBond
/// @notice External ABI surface for the Sibyl agent bonding contract.
/// @dev Agents post a refundable ERC20 bond. A bond can be slashed ONLY on a
///      provable commit/reveal mismatch (fraud). There is deliberately NO
///      Brier-threshold or "being-wrong" slash path: agents are never penalized
///      for honest, well-calibrated-but-incorrect predictions.
interface IAgentBond {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when an agent posts (or tops up) a refundable bond.
    event Staked(bytes32 indexed agentId, address indexed from, uint256 amount, uint256 newStake);

    /// @notice Emitted when an agent voluntarily withdraws part or all of its bond.
    event Withdrawn(bytes32 indexed agentId, address indexed to, uint256 amount, uint256 newStake);

    /// @notice Emitted when an agent's bond is slashed for a provable fraud.
    /// @param agentId        The slashed agent.
    /// @param datasetHash    The replay dataset the fraudulent reveal pertained to.
    /// @param scoringVersion The scoring version the fraudulent reveal pertained to.
    /// @param committedHash  The previously committed hash.
    /// @param amount         The amount transferred to the slash sink.
    event Slashed(
        bytes32 indexed agentId,
        bytes32 indexed datasetHash,
        uint32 indexed scoringVersion,
        bytes32 committedHash,
        uint256 amount
    );

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice The agent has no active bond.
    error NotBonded();
    /// @notice The agent already has an active bond.
    error AlreadyBonded();
    /// @notice The revealed tuple hashes to the committed hash, so no fraud is proven.
    error NoFraud();
    /// @notice Nothing to withdraw (insufficient staked balance).
    error NothingToWithdraw();

    /*//////////////////////////////////////////////////////////////
                                FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Post or top up a refundable bond for `agentId`.
    function stake(bytes32 agentId, uint256 amount) external;

    /// @notice Voluntarily withdraw part or all of an agent's bond.
    function withdraw(bytes32 agentId, uint256 amount) external;

    /// @notice Slash an agent's full bond on a provable commit/reveal mismatch.
    function slash(
        bytes32 agentId,
        bytes32 datasetHash,
        uint32 scoringVersion,
        bytes32 committedHash,
        AgentScore calldata revealed
    ) external;
}
