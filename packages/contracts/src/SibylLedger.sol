// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract SibylLedger {
    struct AgentScore {
        bytes32 agentId;
        uint32 brierPpm;
        bool exists;
    }

    struct Signal {
        bytes32 agentId;
        bool isLong;
        uint32 probabilityPpm;
    }

    struct ConsensusResult {
        bool isLong;
        uint16 sizeBps;
        uint32 confidencePpm;
    }

    address public owner;
    bytes32 public latestDatasetHash;
    bytes32[] public agents;
    mapping(bytes32 => AgentScore) public scores;

    event AgentRegistered(bytes32 indexed agentId);
    event ReplayCommitted(bytes32 indexed datasetHash, uint256 scoreCount);
    event ConsensusReached(bool isLong, uint16 sizeBps, uint32 confidencePpm);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function registerAgent(bytes32 agentId) external onlyOwner {
        require(agentId != bytes32(0), "INVALID_AGENT");
        if (!scores[agentId].exists) {
            agents.push(agentId);
            scores[agentId].exists = true;
            emit AgentRegistered(agentId);
        }
    }

    function commitReplay(bytes32 datasetHash, AgentScore[] calldata agentScores) external onlyOwner {
        require(datasetHash != bytes32(0), "INVALID_HASH");
        latestDatasetHash = datasetHash;

        for (uint256 i = 0; i < agentScores.length; i++) {
            AgentScore calldata s = agentScores[i];
            require(s.agentId != bytes32(0), "INVALID_AGENT");
            if (!scores[s.agentId].exists) {
                agents.push(s.agentId);
            }
            scores[s.agentId] = AgentScore({agentId: s.agentId, brierPpm: s.brierPpm, exists: true});
        }

        emit ReplayCommitted(datasetHash, agentScores.length);
    }

    function computeConsensus(Signal[] calldata liveSignals) external view returns (ConsensusResult memory) {
        require(liveSignals.length > 0, "NO_SIGNALS");

        uint256 weightedLong;
        uint256 weightedTotal;

        for (uint256 i = 0; i < liveSignals.length; i++) {
            Signal calldata sig = liveSignals[i];
            AgentScore memory rep = scores[sig.agentId];
            if (!rep.exists) continue;

            uint256 weight = _weightFromBrier(rep.brierPpm);
            uint256 weightedProb = weight * sig.probabilityPpm;

            weightedTotal += weight * 1_000_000;
            if (sig.isLong) {
                weightedLong += weightedProb;
            } else {
                weightedLong += (weight * (1_000_000 - sig.probabilityPpm));
            }
        }

        require(weightedTotal > 0, "NO_WEIGHT");

        uint256 confidencePpm = (weightedLong * 1_000_000) / weightedTotal;
        bool isLong = confidencePpm >= 500_000;
        uint16 sizeBps = _sizeFromConfidence(uint32(confidencePpm));

        return ConsensusResult({isLong: isLong, sizeBps: sizeBps, confidencePpm: uint32(confidencePpm)});
    }

    function emitConsensus(Signal[] calldata liveSignals) external {
        ConsensusResult memory r = this.computeConsensus(liveSignals);
        emit ConsensusReached(r.isLong, r.sizeBps, r.confidencePpm);
    }

    function _weightFromBrier(uint32 brierPpm) internal pure returns (uint256) {
        if (brierPpm >= 1_000_000) return 1;
        return uint256(1_000_000 - brierPpm) + 1;
    }

    function _sizeFromConfidence(uint32 confidencePpm) internal pure returns (uint16) {
        uint256 edge = confidencePpm > 500_000 ? confidencePpm - 500_000 : 500_000 - confidencePpm;
        uint256 scaled = (edge * 2_000) / 500_000;
        if (scaled > 2_000) return 2_000;
        return uint16(scaled);
    }
}
