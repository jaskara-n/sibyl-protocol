// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISibylLedger} from "./interfaces/ISibylLedger.sol";
import {Ownable2Step} from "./access/Ownable2Step.sol";
import {Pausable} from "./access/Pausable.sol";
import {SibylConsensusLib} from "./libraries/SibylConsensusLib.sol";
import {AgentScore, Signal, ConsensusResult, Direction} from "./types/SibylTypes.sol";

/// @title SibylLedger
/// @notice On-chain reputation + consensus ledger for AI trading agents. Stores per-agent
///         calibration scores committed from a deterministic replay, and computes a
///         reputation-weighted consensus from live signals. All consensus math is delegated
///         to {SibylConsensusLib} so the on-chain and off-chain implementations stay identical.
/// @dev No tokens, no leverage, no fund custody. Owner-gated writes; public view consensus.
contract SibylLedger is ISibylLedger, Ownable2Step, Pausable {
    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Maximum size any consensus can produce, in bps (mirrors the library).
    uint16 public constant MAX_SIZE_BPS = SibylConsensusLib.MAX_SIZE_BPS;

    /// @notice Default per-agent weight cap (ppm) used when the deployer passes 0.
    /// @dev Set so it does NOT bind for realistically-calibrated agents (Brier in ~[0.1, 0.5],
    ///      i.e. weight ~[500k, 900k]) — this preserves the reputation gradient that is the whole
    ///      point of the protocol. It only clamps a near-perfect or gaming agent (Brier < 0.1,
    ///      weight > 900k) from fully dominating. Tunable per deployment via setMaxAgentWeightPpm.
    uint32 public constant DEFAULT_MAX_AGENT_WEIGHT_PPM = 900_000;

    /// @notice Inclusive upper bound for a valid weight cap (= max possible weight).
    uint32 internal constant MAX_WEIGHT_CAP_PPM = 1_000_001;

    /// @notice Hard cap on items returned by a single paginated read.
    uint256 internal constant MAX_PAGE = 200;

    /// @notice Hard cap on the array length accepted by {commitReplay} and {computeConsensus}.
    /// @dev Bounds gas and prevents griefing the public `computeConsensus` view with a huge array.
    uint256 internal constant MAX_BATCH = 256;

    uint256 internal constant ONE_PPM = SibylConsensusLib.ONE_PPM;

    /*//////////////////////////////////////////////////////////////
                                 STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Latest committed replay dataset hash.
    bytes32 public latestDatasetHash;

    /// @notice Scoring version of the latest committed replay.
    uint32 public latestScoringVersion;

    /// @notice Monotonic commit counter; incremented on every {commitReplay}.
    uint64 public epoch;

    /// @notice Per-agent weight ceiling (ppm), tunable by the owner.
    uint32 public maxAgentWeightPpm;

    bytes32[] private _agents;
    mapping(bytes32 => AgentScore) private _scores;
    mapping(bytes32 => AgentScore[]) private _scoreHistory;
    mapping(bytes32 => bool) private _committedReplays;

    /// @param initialMaxAgentWeightPpm Per-agent weight cap (ppm); pass 0 for the default.
    constructor(uint32 initialMaxAgentWeightPpm) {
        uint32 cap = initialMaxAgentWeightPpm == 0 ? DEFAULT_MAX_AGENT_WEIGHT_PPM : initialMaxAgentWeightPpm;
        if (cap > MAX_WEIGHT_CAP_PPM) revert WeightCapOutOfRange(cap);
        maxAgentWeightPpm = cap;
        emit AgentWeightCapUpdated(0, cap);
    }

    /*//////////////////////////////////////////////////////////////
                                  ADMIN
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc ISibylLedger
    function registerAgent(bytes32 agentId) external override onlyOwner whenNotPaused {
        if (agentId == bytes32(0)) revert InvalidAgentId();
        _ensureAgent(agentId);
    }

    /// @inheritdoc ISibylLedger
    function deactivateAgent(bytes32 agentId) external override onlyOwner whenNotPaused {
        AgentScore storage score = _scores[agentId];
        if (!score.exists) revert UnknownAgent(agentId);
        score.active = false;
        emit AgentDeactivated(agentId, epoch);
    }

    /// @inheritdoc ISibylLedger
    function reactivateAgent(bytes32 agentId) external override onlyOwner whenNotPaused {
        AgentScore storage score = _scores[agentId];
        if (!score.exists) revert UnknownAgent(agentId);
        score.active = true;
        emit AgentReactivated(agentId, epoch);
    }

    /// @inheritdoc ISibylLedger
    function setMaxAgentWeightPpm(uint32 newCap) external override onlyOwner whenNotPaused {
        if (newCap == 0 || newCap > MAX_WEIGHT_CAP_PPM) revert WeightCapOutOfRange(newCap);
        uint32 oldCap = maxAgentWeightPpm;
        maxAgentWeightPpm = newCap;
        emit AgentWeightCapUpdated(oldCap, newCap);
    }

    /// @notice Pause state-mutating entrypoints.
    function pause() external onlyOwner whenNotPaused {
        _pause();
    }

    /// @notice Resume state-mutating entrypoints.
    function unpause() external onlyOwner whenPaused {
        _unpause();
    }

    /// @inheritdoc ISibylLedger
    function commitReplay(bytes32 datasetHash, uint32 scoringVersion, AgentScore[] calldata scores)
        external
        override
        onlyOwner
        whenNotPaused
    {
        if (datasetHash == bytes32(0)) revert InvalidDatasetHash();
        if (scores.length == 0) revert EmptyScores();
        if (scores.length > MAX_BATCH) revert TooManyItems(scores.length);

        bytes32 replayKey = keccak256(abi.encodePacked(datasetHash, scoringVersion));
        if (_committedReplays[replayKey]) revert DuplicateReplay(datasetHash, scoringVersion);
        _committedReplays[replayKey] = true;

        uint64 newEpoch = ++epoch;

        for (uint256 i = 0; i < scores.length; i++) {
            bytes32 agentId = scores[i].agentId;
            uint32 brierPpm = scores[i].brierPpm;
            if (agentId == bytes32(0)) revert InvalidAgentId();
            if (brierPpm > ONE_PPM) revert BrierOutOfRange(agentId, brierPpm);

            AgentScore storage existing = _scores[agentId];
            bool active;
            if (existing.exists) {
                active = existing.active; // preserve a manual deactivation across commits
            } else {
                _agents.push(agentId);
                active = true;
                emit AgentRegistered(agentId, newEpoch);
            }

            AgentScore memory updated = AgentScore({
                agentId: agentId,
                brierPpm: brierPpm,
                updatedEpoch: newEpoch,
                active: active,
                exists: true
            });
            _scores[agentId] = updated;
            _scoreHistory[agentId].push(updated);
        }

        latestDatasetHash = datasetHash;
        latestScoringVersion = scoringVersion;
        emit ReplayCommitted(datasetHash, scoringVersion, newEpoch, scores.length);
    }

    /// @inheritdoc ISibylLedger
    function requestValidation(bytes32 agentId, bytes32 datasetHash) external override whenNotPaused {
        if (agentId == bytes32(0)) revert InvalidAgentId();
        emit ValidationRequested(agentId, datasetHash, msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                                CONSENSUS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc ISibylLedger
    function computeConsensus(Signal[] calldata signals) public view override returns (ConsensusResult memory) {
        uint256 total = signals.length;
        if (total > MAX_BATCH) revert TooManyItems(total);

        // Validate probability bounds for every signal, then count contributors.
        uint256 contributors;
        for (uint256 i = 0; i < total; i++) {
            if (signals[i].probabilityPpm > ONE_PPM) {
                revert ProbabilityOutOfRange(signals[i].agentId, signals[i].probabilityPpm);
            }
            AgentScore storage score = _scores[signals[i].agentId];
            if (score.exists && score.active) contributors++;
        }

        uint32[] memory brierPpm = new uint32[](contributors);
        bool[] memory isLong = new bool[](contributors);
        uint32[] memory probabilityPpm = new uint32[](contributors);

        uint256 k;
        for (uint256 i = 0; i < total; i++) {
            AgentScore storage score = _scores[signals[i].agentId];
            if (score.exists && score.active) {
                brierPpm[k] = score.brierPpm;
                isLong[k] = signals[i].isLong;
                probabilityPpm[k] = signals[i].probabilityPpm;
                k++;
            }
        }

        return SibylConsensusLib.compute(brierPpm, isLong, probabilityPpm, maxAgentWeightPpm);
    }

    /// @inheritdoc ISibylLedger
    function emitConsensus(Signal[] calldata signals)
        external
        override
        onlyOwner
        whenNotPaused
        returns (ConsensusResult memory result)
    {
        result = computeConsensus(signals);
        emit ConsensusReached(result.direction, result.sizeBps, result.confidencePpm, result.contributorCount);
    }

    /*//////////////////////////////////////////////////////////////
                                  READS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc ISibylLedger
    function getAgentScore(bytes32 agentId) external view override returns (AgentScore memory) {
        return _scores[agentId];
    }

    /// @inheritdoc ISibylLedger
    function getAgents() external view override returns (bytes32[] memory) {
        return _agents;
    }

    /// @inheritdoc ISibylLedger
    function agentCount() external view override returns (uint256) {
        return _agents.length;
    }

    /// @inheritdoc ISibylLedger
    function agentAt(uint256 index) external view override returns (bytes32) {
        if (index >= _agents.length) revert IndexOutOfBounds(index, _agents.length);
        return _agents[index];
    }

    /// @inheritdoc ISibylLedger
    function getAgentsPaginated(uint256 offset, uint256 limit)
        external
        view
        override
        returns (bytes32[] memory page, uint256 total)
    {
        total = _agents.length;
        (uint256 start, uint256 len) = _window(offset, limit, total);
        page = new bytes32[](len);
        for (uint256 i = 0; i < len; i++) {
            page[i] = _agents[start + i];
        }
    }

    /// @inheritdoc ISibylLedger
    function getAgentScoresPaginated(uint256 offset, uint256 limit)
        external
        view
        override
        returns (AgentScore[] memory page, uint256 total)
    {
        total = _agents.length;
        (uint256 start, uint256 len) = _window(offset, limit, total);
        page = new AgentScore[](len);
        for (uint256 i = 0; i < len; i++) {
            page[i] = _scores[_agents[start + i]];
        }
    }

    /// @inheritdoc ISibylLedger
    function getAgentScoreHistory(bytes32 agentId, uint256 offset, uint256 limit)
        external
        view
        override
        returns (AgentScore[] memory page, uint256 total)
    {
        AgentScore[] storage history = _scoreHistory[agentId];
        total = history.length;
        (uint256 start, uint256 len) = _window(offset, limit, total);
        page = new AgentScore[](len);
        for (uint256 i = 0; i < len; i++) {
            page[i] = history[start + i];
        }
    }

    /// @inheritdoc ISibylLedger
    /// @dev Returns the score in effect as of `atEpoch` (latest entry with `updatedEpoch <= atEpoch`).
    ///      Returns an empty struct if the agent had no score by then. History is appended once per
    ///      {commitReplay} and `epoch` is strictly increasing, so `_scoreHistory` is sorted ascending
    ///      by `updatedEpoch`; this uses an O(log n) binary search for the rightmost matching entry.
    function getAgentScoreAt(bytes32 agentId, uint64 atEpoch) external view override returns (AgentScore memory) {
        AgentScore[] storage history = _scoreHistory[agentId];
        uint256 lo = 0;
        uint256 hi = history.length;
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (history[mid].updatedEpoch <= atEpoch) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        if (lo == 0) return AgentScore(bytes32(0), 0, 0, false, false);
        return history[lo - 1];
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    function _ensureAgent(bytes32 agentId) internal {
        AgentScore storage score = _scores[agentId];
        if (!score.exists) {
            _agents.push(agentId);
            score.agentId = agentId;
            score.active = true;
            score.exists = true;
            emit AgentRegistered(agentId, epoch);
        }
    }

    /// @dev Clamp a (offset, limit) request to a valid [start, start+len) window within `total`.
    function _window(uint256 offset, uint256 limit, uint256 total)
        internal
        pure
        returns (uint256 start, uint256 len)
    {
        if (offset >= total) return (0, 0);
        if (limit > MAX_PAGE) limit = MAX_PAGE;
        uint256 end = offset + limit;
        if (end > total) end = total;
        return (offset, end - offset);
    }
}
