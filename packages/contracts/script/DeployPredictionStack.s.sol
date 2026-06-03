// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";

import {SibylPredictionMarket} from "../src/prediction/SibylPredictionMarket.sol";
import {OutcomeFPMM} from "../src/prediction/OutcomeFPMM.sol";
import {PredictionVenue} from "../src/venues/PredictionVenue.sol";
import {MetaVenue} from "../src/venues/MetaVenue.sol";
import {SibylVault} from "../src/SibylVault.sol";
import {SibylLedger} from "../src/SibylLedger.sol";

import {IERC20} from "../src/interfaces/IERC20.sol";
import {ISibylLedger} from "../src/interfaces/ISibylLedger.sol";
import {IExecutionVenue} from "../src/interfaces/IExecutionVenue.sol";
import {IRewardDistributor} from "../src/interfaces/IRewardDistributor.sol";

/// @title DeployPredictionStack
/// @notice Brings Sibyl vertical #2 (prediction markets) live on Mantle Sepolia
///         (5003) and rewires the vault through a MetaVenue so it can trade BOTH
///         the existing Agni spot market (MNT-USD) and prediction markets.
///
///         Reuses the already-deployed sUSD base asset, the SibylLedger, the
///         RewardDistributor, and the existing Agni execution venue (for the
///         MNT-USD trading market). Only the prediction stack + MetaVenue + a
///         new vault are deployed; nothing existing is mutated except registering
///         the new prediction market on the ledger and seeding a sample FPMM.
/// @dev Broadcast-ready (vm.startBroadcast/stopBroadcast) but meant to be DRY-RUN
///      simulated first (no --broadcast). Never prints any secret.
contract DeployPredictionStack is Script {
    /*//////////////////////////////////////////////////////////////
                    ALREADY-DEPLOYED, REUSED AS-IS
    //////////////////////////////////////////////////////////////*/

    /// @notice Existing sUSD base asset (TestUSD, 18 dec) — prediction collateral too.
    address constant SUSD = 0x6f5BdBe611aE3c84153BD9d2216ce076C2FBba18;
    /// @notice Existing RewardDistributor (owner = deployer).
    address constant REWARD_DISTRIBUTOR = 0x141eA5d5536d81123B4F34Fc3F3aEbd9603aa1AB;
    /// @notice Existing multi-market SibylLedger (owner = deployer).
    address constant LEDGER = 0x1C4cCc2c917EDF45aD1C3C9675cF130b47Db8c11;
    /// @notice Existing Agni execution venue, MNT-USD already configured (WMNT, fee 500).
    address constant AGNI_VENUE = 0x09dc432D56616A204B79ABAd351D84aD78153d5D;

    /*//////////////////////////////////////////////////////////////
                                  PARAMS
    //////////////////////////////////////////////////////////////*/

    /// @notice Existing trading market id (matches the ledger + Agni venue).
    bytes32 constant MNT_USD = keccak256("MNT-USD");

    /// @notice New prediction market id (human-readable handle hashed to bytes32).
    bytes32 constant PRED_ID = keccak256("MNT-ABOVE-1.5-2026Q3");

    /// @notice The market question (its keccak is committed on-chain as questionHash).
    string constant QUESTION = "Will MNT trade above $1.50 (USD) at 2026-09-01 00:00 UTC?";

    /// @notice Resolution opens after this timestamp (~2026-09-01 UTC).
    uint64 constant RESOLVE_TIME = 1_788_220_800;

    /// @notice Initial FPMM liquidity (sUSD): seeds a balanced 50/50 YES/NO book.
    uint256 constant FPMM_SEED = 2_000e18;

    /// @notice Vault performance fee (bps).
    uint16 constant TAKE_RATE_BPS = 200;

    /// @notice Per-market NAV exposure caps (bps).
    uint16 constant CAP_TRADING_BPS = 3000;
    uint16 constant CAP_PRED_BPS = 2000;

    function run() external {
        address deployer = msg.sender;
        console2.log("Deployer (sender):", deployer);
        console2.log("Chain id:", block.chainid);
        console2.log("sUSD balance (deployer):", IERC20(SUSD).balanceOf(deployer));

        vm.startBroadcast();

        // 1) Prediction-market factory + a sample binary market.
        SibylPredictionMarket pm = new SibylPredictionMarket();
        pm.createMarket(PRED_ID, SUSD, keccak256(bytes(QUESTION)), RESOLVE_TIME, deployer);
        console2.log("SibylPredictionMarket:", address(pm));

        // 2) FPMM for the market, seeded with balanced liquidity.
        OutcomeFPMM fpmm = new OutcomeFPMM(pm, PRED_ID);
        IERC20(SUSD).approve(address(fpmm), FPMM_SEED);
        fpmm.addFunding(FPMM_SEED);
        console2.log("OutcomeFPMM:", address(fpmm));

        // 3) PredictionVenue (IExecutionVenue over the FPMM) wired to the market.
        PredictionVenue predVenue = new PredictionVenue(deployer);
        predVenue.setMarket(PRED_ID, address(pm), address(fpmm), SUSD);
        console2.log("PredictionVenue:", address(predVenue));

        // 4) MetaVenue router: MNT-USD -> Agni venue, PRED_ID -> PredictionVenue.
        MetaVenue meta = new MetaVenue(deployer);
        meta.setMarketVenue(MNT_USD, IExecutionVenue(AGNI_VENUE), IERC20(SUSD));
        meta.setMarketVenue(PRED_ID, IExecutionVenue(address(predVenue)), IERC20(SUSD));
        console2.log("MetaVenue:", address(meta));

        // 5) New vault wired to the MetaVenue (trades both worlds), reusing ledger/rewards.
        SibylVault vault = new SibylVault(
            IERC20(SUSD),
            ISibylLedger(LEDGER),
            IExecutionVenue(address(meta)),
            IRewardDistributor(REWARD_DISTRIBUTOR),
            deployer,
            TAKE_RATE_BPS
        );
        vault.setMarketCapBps(MNT_USD, CAP_TRADING_BPS);
        vault.setMarketCapBps(PRED_ID, CAP_PRED_BPS);
        console2.log("SibylVault (new, MetaVenue):", address(vault));

        // 6) Register the prediction market on the ledger so it accrues reputation
        //    + consensus alongside the trading markets (deployer is ledger owner).
        SibylLedger(LEDGER).registerMarket(PRED_ID);

        vm.stopBroadcast();

        console2.log("=============== DEPLOY SUMMARY ===============");
        console2.log("PredictionMarket:    ", address(pm));
        console2.log("FPMM (seeded):       ", address(fpmm));
        console2.log("PredictionVenue:     ", address(predVenue));
        console2.log("MetaVenue:           ", address(meta));
        console2.log("Vault (new):         ", address(vault));
        console2.log("Ledger (reused):     ", LEDGER);
        console2.log("Agni venue (reused): ", AGNI_VENUE);
        console2.log("sUSD (reused):       ", SUSD);
        console2.log("priceYES (1e18):     ", fpmm.priceYES());
        console2.log("==============================================");
    }
}
