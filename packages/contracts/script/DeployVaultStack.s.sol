// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";

import {TestUSD} from "../src/tokens/TestUSD.sol";
import {AgniExecutionVenue} from "../src/venues/AgniExecutionVenue.sol";
import {RewardDistributor} from "../src/RewardDistributor.sol";
import {SibylVault} from "../src/SibylVault.sol";

import {IERC20} from "../src/interfaces/IERC20.sol";
import {ISibylLedger} from "../src/interfaces/ISibylLedger.sol";
import {IExecutionVenue} from "../src/interfaces/IExecutionVenue.sol";
import {IRewardDistributor} from "../src/interfaces/IRewardDistributor.sol";

/*//////////////////////////////////////////////////////////////
            MINIMAL EXTERNAL AGNI INTERFACES (live on 5003)
//////////////////////////////////////////////////////////////*/

/// @notice WMNT (canonical wrapped native, WETH9-style) used as the market token.
interface IWMNT {
    function deposit() external payable;
    function balanceOf(address) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice Agni V3 factory (Uniswap-V3 fork): only the reads we need.
interface IAgniFactory {
    function feeAmountTickSpacing(uint24 fee) external view returns (int24);
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
}

/// @notice Agni NonfungiblePositionManager (Uniswap-V3 NPM fork).
interface INonfungiblePositionManager {
    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24 fee,
        uint160 sqrtPriceX96
    ) external payable returns (address pool);

    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
}

/// @title DeployVaultStack
/// @notice One broadcast-ready script that builds the FULL real Sibyl vault stack on
///         Mantle Sepolia (chainId 5003) against REAL Agni Finance, then creates,
///         initializes, and seeds a real Agni V3 (sUSD/WMNT) pool.
/// @dev Broadcast-ready (uses vm.startBroadcast/stopBroadcast) but intended to be
///      DRY-RUN simulated only (no --broadcast, no --private-key). No leverage / no
///      borrow path is introduced; this only wires the spot stack.
contract DeployVaultStack is Script {
    /*//////////////////////////////////////////////////////////////
                        LIVE AGNI ADDRESSES (5003)
    //////////////////////////////////////////////////////////////*/

    address constant SWAP_ROUTER = 0xe38cfa32cCd918d94E2e20230dFaD1A4Fd8aEF16;
    address constant FACTORY = 0xA9AcD50B042A72c33d05fDcC8ad209d3aD361762;
    address constant NPM = 0x71959543c31EC4d68D9D6C492Bf69A1C174bb394;
    address constant WMNT = 0x67A1f4A939b477A6b7c5BF94D97E45dE87E608eF;

    /// @notice Existing multi-market SibylLedger (owner = deployer; MNT-USD registered).
    address constant LEDGER = 0x1C4cCc2c917EDF45aD1C3C9675cF130b47Db8c11;

    /*//////////////////////////////////////////////////////////////
                                  PARAMS
    //////////////////////////////////////////////////////////////*/

    /// @notice Market id for MNT-USD (matches the ledger registration).
    bytes32 constant MARKET_ID = keccak256("MNT-USD");

    /// @notice sUSD minted to the deployer (1,000,000 sUSD, 18 dec).
    uint256 constant SUSD_MINT = 1_000_000e18;

    /// @notice Native MNT wrapped into WMNT to seed the pool (kept <= 3 of ~9.2).
    uint256 constant WRAP_AMOUNT = 2 ether;

    /// @notice Initial price: 1 WMNT = 1000 sUSD (both 18 decimals).
    uint256 constant SUSD_PER_WMNT = 1000;

    /// @notice Vault performance fee (bps).
    uint16 constant TAKE_RATE_BPS = 200;

    /// @notice Per-market NAV exposure cap (bps).
    uint16 constant MARKET_CAP_BPS = 5000;

    /// @notice Preferred Agni fee tier, with fallbacks if its tickSpacing is 0.
    uint24 constant PREFERRED_FEE = 3000;

    /// @notice Carries deployed addresses across the split steps for final logging.
    struct Deployed {
        address susd;
        address pool;
        uint256 tokenId;
        address venue;
        address rewards;
        address vault;
        uint24 fee;
    }

    function run() external {
        address deployer = msg.sender;
        console2.log("Deployer (sender):", deployer);
        console2.log("Chain id:", block.chainid);
        console2.log("Deployer native balance:", deployer.balance);

        // Pre-broadcast read (no state change): pick a valid fee tier.
        (uint24 fee, int24 tickSpacing) = _pickFee();
        console2.log("Chosen fee tier:", uint256(fee));
        console2.log("Tick spacing:", int256(tickSpacing));

        Deployed memory d;
        d.fee = fee;

        vm.startBroadcast();

        // 1) Deploy sUSD and mint a generous supply to the deployer.
        TestUSD susd = new TestUSD();
        susd.mint(deployer, SUSD_MINT);
        d.susd = address(susd);
        console2.log("TestUSD (sUSD):", d.susd);
        console2.log("sUSD minted to deployer:", SUSD_MINT);

        // 2) Wrap native MNT -> WMNT.
        IWMNT(WMNT).deposit{value: WRAP_AMOUNT}();
        console2.log("WMNT wrapped:", WRAP_AMOUNT);
        console2.log("WMNT balance:", IWMNT(WMNT).balanceOf(deployer));

        // 3 + 4) Create + initialize the Agni pool and seed full-range liquidity.
        _createAndSeedPool(d, fee, tickSpacing, deployer);

        // 5 + 6 + 7) Deploy the venue, reward distributor, and vault; configure them.
        _deployStack(d, deployer);

        // Note: venue.openPosition / closePosition are permissionless (nonReentrant
        // only); the vault calls them with its own approvals, so no ownership/auth
        // hand-off to the vault is required for rebalance to work. Venue ownership
        // stays with the deployer (operator) for setMarket administration.

        vm.stopBroadcast();

        // 8) Final summary.
        console2.log("================ DEPLOY SUMMARY ================");
        console2.log("sUSD:            ", d.susd);
        console2.log("WMNT:            ", WMNT);
        console2.log("Agni pool:       ", d.pool);
        console2.log("Position tokenId:", d.tokenId);
        console2.log("Venue:           ", d.venue);
        console2.log("RewardDistributor", d.rewards);
        console2.log("Vault:           ", d.vault);
        console2.log("Ledger:          ", LEDGER);
        console2.log("Fee tier:        ", uint256(d.fee));
        console2.log("===============================================");
    }

    /// @dev Steps 3 + 4: order tokens, compute sqrtPriceX96 for 1 WMNT = 1000 sUSD,
    ///      create + initialize the pool, then seed a full-range position.
    function _createAndSeedPool(Deployed memory d, uint24 fee, int24 tickSpacing, address deployer) internal {
        (address token0, address token1) = d.susd < WMNT ? (d.susd, WMNT) : (WMNT, d.susd);

        // amount0/amount1 in token0/token1 ordering (2 WMNT + matching sUSD).
        uint256 susdAmount = WRAP_AMOUNT * SUSD_PER_WMNT;
        (uint256 amount0, uint256 amount1) =
            token0 == d.susd ? (susdAmount, WRAP_AMOUNT) : (WRAP_AMOUNT, susdAmount);

        uint160 sqrtPriceX96 = _sqrtPriceX96FromAmounts(amount0, amount1);
        console2.log("token0:", token0);
        console2.log("token1:", token1);
        console2.log("amount0Desired:", amount0);
        console2.log("amount1Desired:", amount1);
        console2.log("sqrtPriceX96:", uint256(sqrtPriceX96));

        d.pool = INonfungiblePositionManager(NPM).createAndInitializePoolIfNecessary(
            token0, token1, fee, sqrtPriceX96
        );
        console2.log("Agni pool (sUSD/WMNT):", d.pool);

        TestUSD(d.susd).approve(NPM, type(uint256).max);
        IWMNT(WMNT).approve(NPM, type(uint256).max);

        d.tokenId = _seedLiquidity(token0, token1, fee, tickSpacing, amount0, amount1, deployer);
    }

    /// @dev Steps 5 + 6 + 7: deploy venue (+ setMarket), reward distributor, and the
    ///      vault (+ setMarketCapBps).
    function _deployStack(Deployed memory d, address deployer) internal {
        AgniExecutionVenue venue = new AgniExecutionVenue(SWAP_ROUTER, d.susd, FACTORY, deployer);
        venue.setMarket(MARKET_ID, WMNT, d.fee);
        d.venue = address(venue);
        console2.log("AgniExecutionVenue:", d.venue);

        RewardDistributor rewards = new RewardDistributor(IERC20(d.susd), deployer);
        d.rewards = address(rewards);
        console2.log("RewardDistributor:", d.rewards);

        SibylVault vault = new SibylVault(
            IERC20(d.susd),
            ISibylLedger(LEDGER),
            IExecutionVenue(d.venue),
            IRewardDistributor(d.rewards),
            deployer,
            TAKE_RATE_BPS
        );
        vault.setMarketCapBps(MARKET_ID, MARKET_CAP_BPS);
        d.vault = address(vault);
        console2.log("SibylVault:", d.vault);
    }

    /*//////////////////////////////////////////////////////////////
                                 HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @dev Mint a full-range position via the NPM. Split out to keep the run()
    ///      stack shallow. tickLower/tickUpper are the nearest usable ticks to
    ///      +/-887272 aligned to `tickSpacing`. minAmounts = 0 for the seed.
    function _seedLiquidity(
        address token0,
        address token1,
        uint24 fee,
        int24 tickSpacing,
        uint256 amount0,
        uint256 amount1,
        address recipient
    ) internal returns (uint256 tokenId) {
        int24 maxTick = (int24(887272) / tickSpacing) * tickSpacing;
        console2.log("tickLower:", int256(-maxTick));
        console2.log("tickUpper:", int256(maxTick));

        uint128 liquidity;
        uint256 used0;
        uint256 used1;
        (tokenId, liquidity, used0, used1) = INonfungiblePositionManager(NPM).mint(
            INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: fee,
                tickLower: -maxTick,
                tickUpper: maxTick,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: 0,
                amount1Min: 0,
                recipient: recipient,
                deadline: block.timestamp + 1 hours
            })
        );
        console2.log("Seeded position tokenId:", tokenId);
        console2.log("Position liquidity:", uint256(liquidity));
        console2.log("Used amount0:", used0);
        console2.log("Used amount1:", used1);
    }

    /// @dev Pick a valid Agni fee tier: prefer 3000, else fall back to 500 / 10000 / 100.
    function _pickFee() internal view returns (uint24 fee, int24 tickSpacing) {
        uint24[4] memory candidates = [PREFERRED_FEE, uint24(500), uint24(10000), uint24(100)];
        for (uint256 i = 0; i < candidates.length; i++) {
            int24 ts = IAgniFactory(FACTORY).feeAmountTickSpacing(candidates[i]);
            if (ts != 0) {
                return (candidates[i], ts);
            }
        }
        revert("no enabled fee tier");
    }

    /// @dev sqrtPriceX96 = sqrt(amount1/amount0) * 2^96. NOTE `amount1 << 192` overflows
    ///      uint256 for amount1 ~ 2000e18, so shift in two halves to stay in range:
    ///      sqrt((amount1 << 96) / amount0) << 48  ==  sqrt(amount1/amount0) * 2^96.
    function _sqrtPriceX96FromAmounts(uint256 amount0, uint256 amount1) internal pure returns (uint160) {
        uint256 inner = (amount1 << 96) / amount0; // (amount1/amount0) * 2^96  (no overflow)
        uint256 s = _sqrt(inner) << 48; // sqrt(amount1/amount0) * 2^48 * 2^48 == * 2^96
        require(s <= type(uint160).max, "sqrtPrice overflow");
        return uint160(s);
    }

    /// @dev Babylonian integer square root.
    function _sqrt(uint256 x) internal pure returns (uint256 z) {
        if (x == 0) return 0;
        z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }
}
