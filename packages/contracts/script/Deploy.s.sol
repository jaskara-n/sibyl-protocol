// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import {SibylLedger} from "../src/SibylLedger.sol";

/// @notice Deploys SibylLedger and logs the address. Reads an optional per-agent
///         weight cap from `MAX_AGENT_WEIGHT_PPM` (0 / unset → contract default).
contract DeployScript is Script {
    function run() external returns (SibylLedger ledger) {
        uint32 cap = uint32(vm.envOr("MAX_AGENT_WEIGHT_PPM", uint256(0)));
        vm.startBroadcast();
        ledger = new SibylLedger(cap);
        vm.stopBroadcast();
        console2.log("SibylLedger deployed at:", address(ledger));
        console2.log("maxAgentWeightPpm:", ledger.maxAgentWeightPpm());
    }
}
