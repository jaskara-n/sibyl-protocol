// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import {SibylLedger} from "../src/SibylLedger.sol";
import {AgentScore} from "../src/types/SibylTypes.sol";

/// @notice Commits a replay to a deployed SibylLedger.
/// @dev Reads `SIBYL_LEDGER_ADDRESS`, `REPLAY_DATASET_HASH`, and `SCORING_VERSION` from env.
///      The score set here is illustrative; production commits are generated from the real
///      replay artifact (`data/artifacts/replay-commit-payload.json`).
contract CommitReplayScript is Script {
    function run() external {
        SibylLedger ledger = SibylLedger(vm.envAddress("SIBYL_LEDGER_ADDRESS"));
        bytes32 datasetHash = vm.envBytes32("REPLAY_DATASET_HASH");
        uint32 scoringVersion = uint32(vm.envOr("SCORING_VERSION", uint256(1)));

        AgentScore[] memory scores = new AgentScore[](3);
        scores[0] = AgentScore({agentId: keccak256("news_v1"), brierPpm: 223450, updatedEpoch: 0, active: true, exists: true});
        scores[1] = AgentScore({agentId: keccak256("funding_v1"), brierPpm: 173000, updatedEpoch: 0, active: true, exists: true});
        scores[2] = AgentScore({agentId: keccak256("momentum_v1"), brierPpm: 182500, updatedEpoch: 0, active: true, exists: true});

        vm.startBroadcast();
        ledger.commitReplay(datasetHash, scoringVersion, scores);
        vm.stopBroadcast();
    }
}
