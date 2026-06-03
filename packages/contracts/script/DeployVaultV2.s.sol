// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";

import {AgniExecutionVenue} from "../src/venues/AgniExecutionVenue.sol";
import {SibylVault} from "../src/SibylVault.sol";

import {IERC20} from "../src/interfaces/IERC20.sol";
import {ISibylLedger} from "../src/interfaces/ISibylLedger.sol";
import {IExecutionVenue} from "../src/interfaces/IExecutionVenue.sol";
import {IRewardDistributor} from "../src/interfaces/IRewardDistributor.sol";

/// @title DeployVaultV2
/// @notice Redeploys ONLY the execution venue + vault on Mantle Sepolia (5003),
///         reusing the already-deployed sUSD base asset, the seeded Agni sUSD/WMNT
///         pool, the RewardDistributor, and the SibylLedger. No token is deployed
///         and the pool is NOT re-seeded.
/// @dev Broadcast-ready (uses vm.startBroadcast/stopBroadcast) but intended to be
///      DRY-RUN simulated only (no --broadcast, no --private-key). No leverage /
///      borrow path is introduced; this only rewires the spot venue + vault.
contract DeployVaultV2 is Script {
    /*//////////////////////////////////////////////////////////////
                        LIVE AGNI ADDRESSES (5003)
    //////////////////////////////////////////////////////////////*/

    /// @notice Agni SwapRouter (Uniswap-V3 router fork).
    address constant SWAP_ROUTER = 0xe38cfa32cCd918d94E2e20230dFaD1A4Fd8aEF16;

    /// @notice Agni V3 factory.
    address constant FACTORY = 0xA9AcD50B042A72c33d05fDcC8ad209d3aD361762;

    /// @notice Canonical wrapped native (WMNT) used as the market token.
    address constant WMNT = 0x67A1f4A939b477A6b7c5BF94D97E45dE87E608eF;

    /*//////////////////////////////////////////////////////////////
                    ALREADY-DEPLOYED, REUSED AS-IS
    //////////////////////////////////////////////////////////////*/

    /// @notice Existing sUSD base asset (TestUSD).
    address constant SUSD = 0x6f5BdBe611aE3c84153BD9d2216ce076C2FBba18;

    /// @notice Existing RewardDistributor (owner = deployer).
    address constant REWARD_DISTRIBUTOR = 0x141eA5d5536d81123B4F34Fc3F3aEbd9603aa1AB;

    /// @notice Existing multi-market SibylLedger (owner = deployer; MNT-USD registered).
    address constant LEDGER = 0x1C4cCc2c917EDF45aD1C3C9675cF130b47Db8c11;

    /*//////////////////////////////////////////////////////////////
                                  PARAMS
    //////////////////////////////////////////////////////////////*/

    /// @notice Market id for MNT-USD (matches the ledger registration).
    bytes32 constant MARKET_ID = keccak256("MNT-USD");

    /// @notice Agni fee tier for the seeded sUSD/WMNT pool.
    uint24 constant FEE = 500;

    /// @notice Vault performance fee (bps).
    uint16 constant TAKE_RATE_BPS = 200;

    /// @notice Per-market NAV exposure cap (bps).
    uint16 constant MARKET_CAP_BPS = 5000;

    function run() external {
        address deployer = msg.sender;
        console2.log("Deployer (sender):", deployer);
        console2.log("Chain id:", block.chainid);

        vm.startBroadcast();

        // 1) Redeploy the execution venue against the existing base asset + Agni.
        AgniExecutionVenue venue = new AgniExecutionVenue(SWAP_ROUTER, SUSD, FACTORY, deployer);
        venue.setMarket(MARKET_ID, WMNT, FEE);
        console2.log("AgniExecutionVenue (new):", address(venue));

        // 2) Redeploy the vault wired to the new venue + existing ledger/rewards.
        SibylVault vault = new SibylVault(
            IERC20(SUSD),
            ISibylLedger(LEDGER),
            IExecutionVenue(address(venue)),
            IRewardDistributor(REWARD_DISTRIBUTOR),
            deployer,
            TAKE_RATE_BPS
        );
        vault.setMarketCapBps(MARKET_ID, MARKET_CAP_BPS);
        console2.log("SibylVault (new):", address(vault));

        vm.stopBroadcast();

        // 3) Final summary.
        console2.log("================ DEPLOY SUMMARY ================");
        console2.log("sUSD (reused):       ", SUSD);
        console2.log("WMNT:                ", WMNT);
        console2.log("Ledger (reused):     ", LEDGER);
        console2.log("RewardDist (reused): ", REWARD_DISTRIBUTOR);
        console2.log("Venue (new):         ", address(venue));
        console2.log("Vault (new):         ", address(vault));
        console2.log("Fee tier:            ", uint256(FEE));
        console2.log("===============================================");
    }
}
