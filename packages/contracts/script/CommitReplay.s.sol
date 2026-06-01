// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/SibylLedger.sol";

contract CommitReplayScript is Script {
    function run() external {
        address ledgerAddress = vm.envAddress("SIBYL_LEDGER_ADDRESS");
        SibylLedger ledger = SibylLedger(ledgerAddress);

        SibylLedger.AgentScore[] memory scores = new SibylLedger.AgentScore[](3);
        scores[0] = SibylLedger.AgentScore({agentId: keccak256("news_v1"), brierPpm: 223450, exists: true});
        scores[1] = SibylLedger.AgentScore({agentId: keccak256("funding_v1"), brierPpm: 173000, exists: true});
        scores[2] = SibylLedger.AgentScore({agentId: keccak256("momentum_v1"), brierPpm: 182500, exists: true});

        bytes32 datasetHash = vm.envBytes32("REPLAY_DATASET_HASH");

        vm.startBroadcast();
        ledger.commitReplay(datasetHash, scores);
        vm.stopBroadcast();
    }
}
