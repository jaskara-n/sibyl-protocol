// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";

import {PredictionFactory} from "../src/prediction/PredictionFactory.sol";
import {SibylPredictionMarket} from "../src/prediction/SibylPredictionMarket.sol";

/// @title DeployPredictionFactory
/// @notice Deploys the permissionless PredictionFactory (one-tx create + FPMM
///         deploy + seed) bound to the live SibylPredictionMarket on Mantle
///         Sepolia (5003). DRY-RUN first (no --broadcast). Prints no secret.
contract DeployPredictionFactory is Script {
    /// @notice Live SibylPredictionMarket factory/controller.
    address constant PREDICTION_MARKET = 0x23960EE69b04e9DC87AE3D5E1e7799c6028edc16;

    function run() external {
        console2.log("Deployer (sender):", msg.sender);
        console2.log("Chain id:", block.chainid);

        vm.startBroadcast();
        PredictionFactory factory = new PredictionFactory(SibylPredictionMarket(PREDICTION_MARKET));
        vm.stopBroadcast();

        console2.log("PredictionFactory:", address(factory));
        console2.log("bound PredictionMarket:", PREDICTION_MARKET);
    }
}
