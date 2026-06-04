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
        bytes32 indexed datasetHash,
        uint32 indexed scoringVersion,
        uint64 indexed epoch,
        bytes32 marketId,
        uint256 scoreCount
    );
    event ConsensusReached(
        bytes32 indexed marketId,
        Direction direction,
        uint16 sizeBps,
        uint32 confidencePpm,
        uint32 contributorCount
    );
    event ValidationRequested(bytes32 indexed agentId, bytes32 indexed datasetHash, address indexed requester);
    event AgentWeightCapUpdated(uint32 oldCap, uint32 newCap);
    event MarketRegistered(bytes32 indexed marketId, uint64 indexed epoch);
    event MarketActiveSet(bytes32 indexed marketId, bool active);

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
    error InvalidMarketId();
    error UnknownMarket(bytes32 marketId);

    /*//////////////////////////////////////////////////////////////
                                  ADMIN
    //////////////////////////////////////////////////////////////*/

    /// @notice Register an agent identity. Idempotent; emits {AgentRegistered} only on first sight.
    /// @param agentId Non-zero opaque agent identity reference.
    function registerAgent(bytes32 agentId) external;

    /// @notice Deactivate an agent in a market so it no longer contributes there (record preserved).
    /// @param agentId The agent to deactivate; must already have a score in `marketId`.
    /// @param marketId The market to scope the deactivation to.
    function deactivateAgent(bytes32 agentId, bytes32 marketId) external;

    /// @notice Re-include a previously deactivated agent in a market.
    /// @param agentId The agent to reactivate; must already have a score in `marketId`.
    /// @param marketId The market to scope the reactivation to.
    function reactivateAgent(bytes32 agentId, bytes32 marketId) external;

    /// @notice Update the per-agent weight cap (ppm).
    /// @param newCap New cap in ppm; must be in [1, 1_000_001].
    function setMaxAgentWeightPpm(uint32 newCap) external;

    /// @notice Register a market. Idempotent; emits {MarketRegistered} only on first sight; active=true.
    /// @param marketId Non-zero opaque market identity reference.
    function registerMarket(bytes32 marketId) external;

    /// @notice Toggle a market's active flag. Reverts {UnknownMarket} if not registered.
    /// @param marketId The market to toggle; must already exist.
    /// @param active New active flag.
    function setMarketActive(bytes32 marketId, bool active) external;

    /// @notice Commit a deterministic, market-scoped replay: dataset hash + scoring version + scores.
    /// @dev Idempotent by (datasetHash, scoringVersion, marketId); auto-registers unknown agents
    ///      globally and into the market's agent list; a manual per-market deactivation is preserved
    ///      across commits. Reverts {UnknownMarket} if `marketId` is not registered.
    /// @param datasetHash Canonical hash of the frozen replay dataset; must be non-zero.
    /// @param scoringVersion Numeric version of the scoring recipe used to produce these scores.
    /// @param marketId The market these scores are scoped to; must be registered.
    /// @param scores Per-agent calibration scores to record this epoch.
    function commitReplay(
        bytes32 datasetHash,
        uint32 scoringVersion,
        bytes32 marketId,
        AgentScore[] calldata scores
    ) external;

    /*//////////////////////////////////////////////////////////////
                                CONSENSUS
    //////////////////////////////////////////////////////////////*/

    /// @notice Pure-read, market-scoped reputation-weighted consensus over live signals. Never
    ///         reverts on empty input or zero matching weight; returns a FLAT result instead.
    ///         Only signals whose (agentId, marketId) score exists && is active, where the market
    ///         is active and `signal.marketId == marketId`, contribute.
    /// @param marketId The market to scope the consensus to.
    /// @param signals Live agent signals for the current decision.
    /// @return The consensus direction, size (bps), confidence (ppm), contributor count, and marketId.
    function computeConsensus(bytes32 marketId, Signal[] calldata signals)
        external
        view
        returns (ConsensusResult memory);

    /// @notice Compute market-scoped consensus and emit {ConsensusReached}. Owner-gated so the
    ///         event is authentic.
    /// @param marketId The market to scope the consensus to.
    /// @param signals Live agent signals for the current decision.
    /// @return The consensus result that was also emitted.
    function emitConsensus(bytes32 marketId, Signal[] calldata signals)
        external
        returns (ConsensusResult memory);

    /// @notice Sum of capped inverse-Brier weights over the active agents registered in a market.
    /// @param marketId The market to aggregate over.
    /// @return totalWeight Sum of per-agent `min(weightPpm(brier), maxAgentWeightPpm)`.
    /// @return activeAgentCount Number of active agents counted.
    function convictionIndex(bytes32 marketId)
        external
        view
        returns (uint256 totalWeight, uint32 activeAgentCount);

    /// @notice Weight x confidence aggregate for a specific signal set, reusing the consensus filter.
    /// @param marketId The market to scope to.
    /// @param signals Live agent signals for the current decision.
    /// @return totalWeight Sum of capped weights of contributing signals.
    /// @return confidencePpm Weighted long-confidence (ppm) over the contributing signals.
    function convictionForSignals(bytes32 marketId, Signal[] calldata signals)
        external
        view
        returns (uint256 totalWeight, uint32 confidencePpm);

    /// @notice Permissionless signal that an off-chain validator should re-run the replay.
    /// @param agentId The agent whose record is being challenged/validated; must be non-zero.
    /// @param datasetHash The dataset hash to re-run and verify.
    function requestValidation(bytes32 agentId, bytes32 datasetHash) external;

    /*//////////////////////////////////////////////////////////////
                                  READS
    //////////////////////////////////////////////////////////////*/

    /// @notice The monotonic commit epoch counter (incremented on every {commitReplay}).
    /// @return The current epoch.
    function epoch() external view returns (uint64);

    /// @notice Whether a market is registered and active.
    /// @param marketId The market to query.
    /// @return True iff registered and active.
    function isMarketActive(bytes32 marketId) external view returns (bool);

    /// @notice Get the full list of registered market ids.
    /// @return The complete market id array.
    function getMarkets() external view returns (bytes32[] memory);

    /// @notice Number of registered markets.
    /// @return The market count.
    function marketCount() external view returns (uint256);

    /// @notice Paginated read over registered market ids.
    /// @param offset Start index.
    /// @param limit Max items to return (clamped to an internal page cap).
    /// @return page The market ids in the window.
    /// @return total The total number of registered markets.
    function getMarketsPaginated(uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory page, uint256 total);

    /// @notice Get the current score record for an agent in a market.
    /// @param agentId The agent to query.
    /// @param marketId The market to scope to.
    /// @return The agent's current market-scoped {AgentScore} (zero-valued if unknown).
    function getAgentScore(bytes32 agentId, bytes32 marketId) external view returns (AgentScore memory);

    /// @notice Paginated read over current per-(agent,market) score records for a market.
    /// @param marketId The market to scope to.
    /// @param offset Start index in the market's agent list.
    /// @param limit Max items to return (clamped to an internal page cap).
    /// @return page The score records in the window.
    /// @return total The total number of agents in the market.
    function getAgentScoresByMarketPaginated(bytes32 marketId, uint256 offset, uint256 limit)
        external
        view
        returns (AgentScore[] memory page, uint256 total);

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

    /// @notice Paginated read over an agent's market-scoped historical score records (ascending by epoch).
    /// @param agentId The agent to query.
    /// @param marketId The market to scope to.
    /// @param offset Start index in the history.
    /// @param limit Max items to return (clamped to an internal page cap).
    /// @return page The historical score records in the window.
    /// @return total The total number of history entries for the (agent, market).
    function getAgentScoreHistory(bytes32 agentId, bytes32 marketId, uint256 offset, uint256 limit)
        external
        view
        returns (AgentScore[] memory page, uint256 total);

    /// @notice Get the market-scoped score in effect for an agent as of a specific epoch.
    /// @param agentId The agent to query.
    /// @param marketId The market to scope to.
    /// @param atEpoch The epoch to read as-of.
    /// @return The latest score with `updatedEpoch <= atEpoch` (zero-valued if none).
    function getAgentScoreAt(bytes32 agentId, bytes32 marketId, uint64 atEpoch)
        external
        view
        returns (AgentScore memory);
}
