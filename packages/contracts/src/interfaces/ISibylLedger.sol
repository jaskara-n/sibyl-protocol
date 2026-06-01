// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AgentScore, Signal, ConsensusResult, Direction} from "../types/SibylTypes.sol";

/// @title ISibylLedger
/// @notice External ABI surface for the Sibyl reputation + consensus ledger.
/// @dev Declares every Sibyl-specific function, event, and custom error. Access-control
///      and pause primitives (ownership/paused events + errors) live on the
///      `Ownable2Step` / `Pausable` base contracts to avoid duplicate declarations.
interface ISibylLedger {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event AgentRegistered(bytes32 indexed agentId, uint64 indexed epoch);
    event AgentDeactivated(bytes32 indexed agentId, uint64 indexed epoch);
    event AgentReactivated(bytes32 indexed agentId, uint64 indexed epoch);
    event ReplayCommitted(
        bytes32 indexed datasetHash, uint32 indexed scoringVersion, uint64 indexed epoch, uint256 scoreCount
    );
    event ConsensusReached(Direction direction, uint16 sizeBps, uint32 confidencePpm, uint32 contributorCount);
    event ValidationRequested(bytes32 indexed agentId, bytes32 indexed datasetHash, address indexed requester);
    event AgentWeightCapUpdated(uint32 oldCap, uint32 newCap);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error InvalidAgentId();
    error InvalidDatasetHash();
    error EmptyScores();
    error TooManyItems(uint256 count);
    error UnknownAgent(bytes32 agentId);
    error ProbabilityOutOfRange(bytes32 agentId, uint32 probabilityPpm);
    error BrierOutOfRange(bytes32 agentId, uint32 brierPpm);
    error DuplicateReplay(bytes32 datasetHash, uint32 scoringVersion);
    error WeightCapOutOfRange(uint32 maxAgentWeightPpm);
    error IndexOutOfBounds(uint256 index, uint256 length);

    /*//////////////////////////////////////////////////////////////
                                  ADMIN
    //////////////////////////////////////////////////////////////*/

    /// @notice Register an agent identity. Idempotent; emits {AgentRegistered} only on first sight.
    /// @param agentId Non-zero opaque agent identity reference.
    function registerAgent(bytes32 agentId) external;

    /// @notice Deactivate an agent so it no longer contributes to consensus (record preserved).
    /// @param agentId The agent to deactivate; must already exist.
    function deactivateAgent(bytes32 agentId) external;

    /// @notice Re-include a previously deactivated agent.
    /// @param agentId The agent to reactivate; must already exist.
    function reactivateAgent(bytes32 agentId) external;

    /// @notice Update the per-agent weight cap (ppm).
    /// @param newCap New cap in ppm; must be in [1, 1_000_001].
    function setMaxAgentWeightPpm(uint32 newCap) external;

    /// @notice Commit a deterministic replay: dataset hash + scoring version + per-agent scores.
    /// @dev Idempotent by (datasetHash, scoringVersion); auto-registers unknown agents; a manual
    ///      deactivation is preserved across commits.
    /// @param datasetHash Canonical hash of the frozen replay dataset; must be non-zero.
    /// @param scoringVersion Numeric version of the scoring recipe used to produce these scores.
    /// @param scores Per-agent calibration scores to record this epoch.
    function commitReplay(bytes32 datasetHash, uint32 scoringVersion, AgentScore[] calldata scores) external;

    /*//////////////////////////////////////////////////////////////
                                CONSENSUS
    //////////////////////////////////////////////////////////////*/

    /// @notice Pure-read reputation-weighted consensus over live signals. Never reverts on
    ///         empty input or zero matching weight; returns a FLAT result instead.
    /// @param signals Live agent signals for the current decision.
    /// @return The consensus direction, size (bps), confidence (ppm), and contributor count.
    function computeConsensus(Signal[] calldata signals) external view returns (ConsensusResult memory);

    /// @notice Compute consensus and emit {ConsensusReached}. Owner-gated so the event is authentic.
    /// @param signals Live agent signals for the current decision.
    /// @return The consensus result that was also emitted.
    function emitConsensus(Signal[] calldata signals) external returns (ConsensusResult memory);

    /// @notice Permissionless signal that an off-chain validator should re-run the replay.
    /// @param agentId The agent whose record is being challenged/validated; must be non-zero.
    /// @param datasetHash The dataset hash to re-run and verify.
    function requestValidation(bytes32 agentId, bytes32 datasetHash) external;

    /*//////////////////////////////////////////////////////////////
                                  READS
    //////////////////////////////////////////////////////////////*/

    /// @notice Get the current score record for an agent.
    /// @param agentId The agent to query.
    /// @return The agent's current {AgentScore} (zero-valued if unknown).
    function getAgentScore(bytes32 agentId) external view returns (AgentScore memory);

    /// @notice Get the full list of registered agent ids.
    /// @return The complete agent id array.
    function getAgents() external view returns (bytes32[] memory);

    /// @notice Number of registered agents.
    /// @return The agent count.
    function agentCount() external view returns (uint256);

    /// @notice Get a registered agent id by index.
    /// @param index Position in the agents array.
    /// @return The agent id at `index`.
    function agentAt(uint256 index) external view returns (bytes32);

    /// @notice Paginated read over registered agent ids.
    /// @param offset Start index.
    /// @param limit Max items to return (clamped to an internal page cap).
    /// @return page The agent ids in the window.
    /// @return total The total number of registered agents.
    function getAgentsPaginated(uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory page, uint256 total);

    /// @notice Paginated read over current agent score records.
    /// @param offset Start index.
    /// @param limit Max items to return (clamped to an internal page cap).
    /// @return page The score records in the window.
    /// @return total The total number of registered agents.
    function getAgentScoresPaginated(uint256 offset, uint256 limit)
        external
        view
        returns (AgentScore[] memory page, uint256 total);

    /// @notice Paginated read over an agent's historical score records (ascending by epoch).
    /// @param agentId The agent to query.
    /// @param offset Start index in the history.
    /// @param limit Max items to return (clamped to an internal page cap).
    /// @return page The historical score records in the window.
    /// @return total The total number of history entries for the agent.
    function getAgentScoreHistory(bytes32 agentId, uint256 offset, uint256 limit)
        external
        view
        returns (AgentScore[] memory page, uint256 total);

    /// @notice Get the score in effect for an agent as of a specific epoch.
    /// @param agentId The agent to query.
    /// @param atEpoch The epoch to read as-of.
    /// @return The latest score with `updatedEpoch <= atEpoch` (zero-valued if none).
    function getAgentScoreAt(bytes32 agentId, uint64 atEpoch) external view returns (AgentScore memory);
}
