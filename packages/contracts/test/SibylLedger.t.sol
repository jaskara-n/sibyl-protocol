// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SibylLedger.sol";

contract SibylLedgerTest is Test {
    SibylLedger internal ledger;

    function setUp() public {
        ledger = new SibylLedger();
    }

    function testOwnerSet() public view {
        assertEq(ledger.owner(), address(this));
    }

    function testRegisterAgent() public {
        bytes32 agentId = keccak256("momentum_v1");
        ledger.registerAgent(agentId);
        (bytes32 stored, uint32 brier, bool exists) = ledger.scores(agentId);
        assertEq(stored, agentId);
        assertEq(brier, 0);
        assertTrue(exists);
    }

    function testCommitReplayStoresHashAndScores() public {
        bytes32 datasetHash = keccak256("dataset_v1");

        SibylLedger.AgentScore[] memory scores = new SibylLedger.AgentScore[](2);
        scores[0] = SibylLedger.AgentScore({agentId: keccak256("news_v1"), brierPpm: 220000, exists: true});
        scores[1] = SibylLedger.AgentScore({agentId: keccak256("momentum_v1"), brierPpm: 180000, exists: true});

        ledger.commitReplay(datasetHash, scores);

        assertEq(ledger.latestDatasetHash(), datasetHash);
        (, uint32 newsBrier,) = ledger.scores(keccak256("news_v1"));
        assertEq(newsBrier, 220000);
    }

    function testComputeConsensusReturnsWeightedDecision() public {
        SibylLedger.AgentScore[] memory replayScores = new SibylLedger.AgentScore[](2);
        replayScores[0] = SibylLedger.AgentScore({agentId: keccak256("news_v1"), brierPpm: 200000, exists: true});
        replayScores[1] = SibylLedger.AgentScore({agentId: keccak256("momentum_v1"), brierPpm: 150000, exists: true});

        ledger.commitReplay(keccak256("dataset_v1"), replayScores);

        SibylLedger.Signal[] memory signals = new SibylLedger.Signal[](2);
        signals[0] = SibylLedger.Signal({agentId: keccak256("news_v1"), isLong: true, probabilityPpm: 650000});
        signals[1] = SibylLedger.Signal({agentId: keccak256("momentum_v1"), isLong: true, probabilityPpm: 700000});

        SibylLedger.ConsensusResult memory result = ledger.computeConsensus(signals);
        assertTrue(result.isLong);
        assertGt(result.sizeBps, 0);
        assertGt(result.confidencePpm, 500000);
    }
}
