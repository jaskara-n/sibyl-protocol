// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {SibylVault} from "../src/SibylVault.sol";
import {ISibylVault} from "../src/interfaces/ISibylVault.sol";
import {SibylLedger} from "../src/SibylLedger.sol";
import {RewardDistributor} from "../src/RewardDistributor.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {ISibylLedger} from "../src/interfaces/ISibylLedger.sol";
import {IExecutionVenue} from "../src/interfaces/IExecutionVenue.sol";
import {IRewardDistributor} from "../src/interfaces/IRewardDistributor.sol";
import {Ownable2Step} from "../src/access/Ownable2Step.sol";
import {Pausable} from "../src/access/Pausable.sol";
import {ReentrancyGuard} from "../src/access/ReentrancyGuard.sol";
import {SibylConsensusLib} from "../src/libraries/SibylConsensusLib.sol";
import {AgentScore, Direction} from "../src/types/SibylTypes.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockExecutionVenue} from "./mocks/MockExecutionVenue.sol";

contract SibylVaultTest is Test {
    SibylVault internal vault;
    SibylLedger internal ledger;
    RewardDistributor internal dist;
    MockExecutionVenue internal venue;
    MockERC20 internal cash; // vault asset
    MockERC20 internal pos; // venue position token

    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant FEE_RECIPIENT = address(0xFEE);
    address internal constant OPERATOR = address(0x09E);

    bytes32 internal constant MKT_A = keccak256("BTC-USD");
    bytes32 internal constant MKT_B = keccak256("ETH-USD");

    bytes32 internal constant AGENT_1 = keccak256("agent_1");
    bytes32 internal constant AGENT_2 = keccak256("agent_2");
    bytes32 internal constant AGENT_3 = keccak256("agent_3");

    uint8 internal constant DIR_FLAT = uint8(Direction.FLAT);
    uint8 internal constant DIR_LONG = uint8(Direction.LONG);
    uint8 internal constant DIR_SHORT = uint8(Direction.SHORT);

    uint16 internal constant TAKE_RATE_BPS = 1_000; // 10%

    function setUp() public {
        cash = new MockERC20();
        pos = new MockERC20();
        venue = new MockExecutionVenue(IERC20(address(cash)), IERC20(address(pos)));
        // Seed venue with position-token inventory so it can fill LONG opens.
        pos.mint(address(venue), 1_000_000 ether);

        ledger = new SibylLedger(0); // default cap 900_000
        ledger.registerMarket(MKT_A);
        ledger.registerMarket(MKT_B);
        _commitScores();

        dist = new RewardDistributor(IERC20(address(cash)), OPERATOR);

        vault = new SibylVault(
            IERC20(address(cash)),
            ISibylLedger(address(ledger)),
            IExecutionVenue(address(venue)),
            IRewardDistributor(address(dist)),
            FEE_RECIPIENT,
            TAKE_RATE_BPS
        );
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    function _score(bytes32 id, uint32 brier) internal pure returns (AgentScore memory) {
        return AgentScore({
            agentId: id,
            brierPpm: brier,
            updatedEpoch: 0,
            active: true,
            exists: true,
            marketId: bytes32(0)
        });
    }

    function _commitScores() internal {
        // MKT_A: agents 1 (brier 200k -> w 800001) + 2 (brier 150k -> w 850001).
        AgentScore[] memory a = new AgentScore[](2);
        a[0] = _score(AGENT_1, 200_000);
        a[1] = _score(AGENT_2, 150_000);
        ledger.commitReplay(keccak256("ds_a"), 1, MKT_A, a);

        // MKT_B: agent 3 (brier 400k -> w 600001).
        AgentScore[] memory b = new AgentScore[](1);
        b[0] = _score(AGENT_3, 400_000);
        ledger.commitReplay(keccak256("ds_b"), 1, MKT_B, b);
    }

    function _depositFrom(address who, uint256 amount) internal returns (uint256 shares) {
        cash.mint(who, amount);
        vm.startPrank(who);
        cash.approve(address(vault), type(uint256).max);
        shares = vault.deposit(amount, who);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    function test_constructor_setsState() public view {
        assertEq(vault.asset(), address(cash));
        assertEq(address(vault.ledger()), address(ledger));
        assertEq(address(vault.venue()), address(venue));
        assertEq(address(vault.rewardDistributor()), address(dist));
        assertEq(vault.feeRecipient(), FEE_RECIPIENT);
        assertEq(vault.takeRateBps(), TAKE_RATE_BPS);
        assertEq(vault.owner(), address(this));
    }

    function test_constructor_revertsOnHighTakeRate() public {
        vm.expectRevert(abi.encodeWithSelector(ISibylVault.TakeRateTooHigh.selector, uint16(10_001)));
        new SibylVault(
            IERC20(address(cash)),
            ISibylLedger(address(ledger)),
            IExecutionVenue(address(venue)),
            IRewardDistributor(address(dist)),
            FEE_RECIPIENT,
            10_001
        );
    }

    function test_constructor_revertsOnZeroAddress() public {
        vm.expectRevert(ISibylVault.ZeroAddress.selector);
        new SibylVault(
            IERC20(address(cash)),
            ISibylLedger(address(ledger)),
            IExecutionVenue(address(venue)),
            IRewardDistributor(address(dist)),
            address(0),
            TAKE_RATE_BPS
        );
    }

    /*//////////////////////////////////////////////////////////////
                       ERC-4626 SHARE MATH ROUND-TRIP
    //////////////////////////////////////////////////////////////*/

    function test_deposit_firstDepositorMintsOneToOne() public {
        uint256 shares = _depositFrom(ALICE, 1_000 ether);
        assertEq(shares, 1_000 ether, "1:1 first deposit (virtual offset = +1/+1)");
        assertEq(vault.balanceOf(ALICE), 1_000 ether);
        assertEq(vault.totalAssets(), 1_000 ether);
        assertEq(vault.totalSupply(), 1_000 ether);
    }

    function test_roundTrip_noValueLeak() public {
        uint256 deposited = 1_000 ether;
        uint256 shares = _depositFrom(ALICE, deposited);

        // Redeem everything back: must not leak value.
        vm.prank(ALICE);
        uint256 assetsOut = vault.redeem(shares, ALICE, ALICE);

        assertEq(assetsOut, deposited, "exact round-trip, no leak");
        assertEq(cash.balanceOf(ALICE), deposited);
        assertEq(vault.totalSupply(), 0);
        assertEq(vault.balanceOf(ALICE), 0);
    }

    function test_withdraw_burnsExactShares() public {
        _depositFrom(ALICE, 1_000 ether);
        vm.prank(ALICE);
        uint256 burned = vault.withdraw(400 ether, ALICE, ALICE);
        assertEq(burned, 400 ether);
        assertEq(cash.balanceOf(ALICE), 400 ether);
        assertEq(vault.balanceOf(ALICE), 600 ether);
        assertEq(vault.totalAssets(), 600 ether);
    }

    function test_secondDepositor_proportionalShares() public {
        _depositFrom(ALICE, 1_000 ether);
        uint256 bobShares = _depositFrom(BOB, 500 ether);
        // No gain yet, so 1:1 still holds.
        assertEq(bobShares, 500 ether);

        // Both can fully redeem with no leak.
        uint256 aliceBal = vault.balanceOf(ALICE);
        uint256 bobBal = vault.balanceOf(BOB);
        vm.prank(ALICE);
        uint256 aliceOut = vault.redeem(aliceBal, ALICE, ALICE);
        vm.prank(BOB);
        uint256 bobOut = vault.redeem(bobBal, BOB, BOB);
        assertEq(aliceOut, 1_000 ether);
        assertEq(bobOut, 500 ether);
    }

    function test_inflationAttack_resistedByVirtualOffset() public {
        // Classic first-depositor inflation attack: attacker deposits 1 wei to mint
        // 1 share, then donates a large amount directly to spike the share price so a
        // victim's deposit would round down to 0 shares (total loss) WITHOUT the
        // virtual offset.
        uint256 attackerShares = _depositFrom(ALICE, 1); // 1 share
        assertEq(attackerShares, 1);

        // Direct donation to inflate the price-per-share.
        uint256 donation = 100 ether;
        cash.mint(address(vault), donation);

        // Victim deposits; the virtual offset guarantees they still receive nonzero
        // shares (without it, the inflated price would round their mint down to 0,
        // a total loss).
        uint256 victimDeposit = 1_000 ether;
        uint256 victimShares = _depositFrom(BOB, victimDeposit);
        assertGt(victimShares, 0, "victim still mints nonzero shares (rounding protected)");

        // The attack is unprofitable: the attacker's single share is worth far less
        // than what they sank into the donation, so they cannot steal the victim's
        // deposit via rounding.
        vm.prank(ALICE);
        uint256 attackerOut = vault.redeem(attackerShares, ALICE, ALICE);
        assertLt(attackerOut, donation, "attacker cannot recoup even the donation");
    }

    /*//////////////////////////////////////////////////////////////
                              TOTAL ASSETS
    //////////////////////////////////////////////////////////////*/

    function test_totalAssets_cashPlusPositions() public {
        _depositFrom(ALICE, 1_000 ether);
        // Configure markets and consensus so rebalance opens positions.
        vault.setMarketCapBps(MKT_A, 10_000);
        vault.recordConsensus(MKT_A, DIR_LONG, 2_000); // 20% size

        bytes32[] memory mkts = new bytes32[](1);
        mkts[0] = MKT_A;
        uint256[] memory minOuts = new uint256[](1);
        minOuts[0] = 0;

        vault.rebalance(mkts, minOuts, block.timestamp + 1);

        uint256 posValue = venue.positionValue(MKT_A);
        assertGt(posValue, 0, "position opened");

        uint256 cashHeld = cash.balanceOf(address(vault));
        assertEq(vault.totalAssets(), cashHeld + posValue, "NAV = cash + positions");
        // NAV preserved (1:1 fills): still 1000 ether.
        assertEq(vault.totalAssets(), 1_000 ether, "NAV conserved across rebalance");
    }

    /*//////////////////////////////////////////////////////////////
                              REBALANCE
    //////////////////////////////////////////////////////////////*/

    function test_rebalance_convictionSplitAndSizing() public {
        _depositFrom(ALICE, 1_000 ether);

        vault.setMarketCapBps(MKT_A, 10_000);
        vault.setMarketCapBps(MKT_B, 10_000);
        vault.recordConsensus(MKT_A, DIR_LONG, 5_000); // 50% size
        vault.recordConsensus(MKT_B, DIR_LONG, 5_000); // 50% size

        (uint256 wA,) = ledger.convictionIndex(MKT_A);
        (uint256 wB,) = ledger.convictionIndex(MKT_B);
        uint256 sum = wA + wB;
        uint256 nav = 1_000 ether;

        uint256 expectedA = (nav * wA * 5_000) / (sum * 10_000);
        uint256 expectedB = (nav * wB * 5_000) / (sum * 10_000);

        bytes32[] memory mkts = new bytes32[](2);
        mkts[0] = MKT_A;
        mkts[1] = MKT_B;
        uint256[] memory minOuts = new uint256[](2);

        vault.rebalance(mkts, minOuts, block.timestamp + 1);

        assertEq(venue.positionValue(MKT_A), expectedA, "MKT_A target = conviction split * size");
        assertEq(venue.positionValue(MKT_B), expectedB, "MKT_B target = conviction split * size");
        assertGt(wA, wB, "MKT_A has higher conviction");
        assertGt(expectedA, expectedB, "higher conviction => larger target");
    }

    function test_rebalance_respectsPerMarketCap() public {
        _depositFrom(ALICE, 1_000 ether);

        // Size would target 100% but cap clamps to 10% of NAV.
        vault.setMarketCapBps(MKT_A, 1_000); // 10% cap
        vault.recordConsensus(MKT_A, DIR_LONG, 10_000); // 100% size

        bytes32[] memory mkts = new bytes32[](1);
        mkts[0] = MKT_A;
        uint256[] memory minOuts = new uint256[](1);

        vault.rebalance(mkts, minOuts, block.timestamp + 1);

        assertEq(venue.positionValue(MKT_A), 100 ether, "clamped to 10% NAV cap");
    }

    function test_rebalance_flatOrShortClosesPosition() public {
        _depositFrom(ALICE, 1_000 ether);
        vault.setMarketCapBps(MKT_A, 10_000);
        vault.recordConsensus(MKT_A, DIR_LONG, 5_000);

        bytes32[] memory mkts = new bytes32[](1);
        mkts[0] = MKT_A;
        uint256[] memory minOuts = new uint256[](1);

        vault.rebalance(mkts, minOuts, block.timestamp + 1);
        assertGt(venue.positionValue(MKT_A), 0, "opened");

        // Now consensus flips to FLAT: rebalance should close fully.
        vault.recordConsensus(MKT_A, DIR_FLAT, 0);
        vault.rebalance(mkts, minOuts, block.timestamp + 1);
        assertEq(venue.positionValue(MKT_A), 0, "FLAT closes the position");
        assertEq(vault.totalAssets(), 1_000 ether, "NAV conserved");
    }

    function test_rebalance_revertsWhenPaused() public {
        _depositFrom(ALICE, 1_000 ether);
        vault.setMarketCapBps(MKT_A, 10_000);
        vault.recordConsensus(MKT_A, DIR_LONG, 5_000);
        vault.pause();

        bytes32[] memory mkts = new bytes32[](1);
        mkts[0] = MKT_A;
        uint256[] memory minOuts = new uint256[](1);

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.rebalance(mkts, minOuts, block.timestamp + 1);
    }

    function test_rebalance_onlyOwner() public {
        bytes32[] memory mkts = new bytes32[](0);
        uint256[] memory minOuts = new uint256[](0);
        vm.prank(ALICE);
        vm.expectRevert(Ownable2Step.NotOwner.selector);
        vault.rebalance(mkts, minOuts, block.timestamp + 1);
    }

    function test_rebalance_revertsOnLengthMismatch() public {
        bytes32[] memory mkts = new bytes32[](1);
        uint256[] memory minOuts = new uint256[](2);
        vm.expectRevert(ISibylVault.LengthMismatch.selector);
        vault.rebalance(mkts, minOuts, block.timestamp + 1);
    }

    function test_rebalance_revertsPastDeadline() public {
        vm.warp(1_000);
        bytes32[] memory mkts = new bytes32[](1);
        mkts[0] = MKT_A;
        uint256[] memory minOuts = new uint256[](1);
        vm.expectRevert(ISibylVault.PastDeadline.selector);
        vault.rebalance(mkts, minOuts, block.timestamp - 1);
    }

    function test_rebalance_enforcesMinOut() public {
        _depositFrom(ALICE, 1_000 ether);
        vault.setMarketCapBps(MKT_A, 10_000);
        vault.recordConsensus(MKT_A, DIR_LONG, 5_000);

        bytes32[] memory mkts = new bytes32[](1);
        mkts[0] = MKT_A;
        uint256[] memory minOuts = new uint256[](1);
        // 1:1 fill means received == delta; demand more than delta to trip slippage.
        minOuts[0] = type(uint256).max;

        vm.expectRevert(MockExecutionVenue.SlippageExceeded.selector);
        vault.rebalance(mkts, minOuts, block.timestamp + 1);
    }

    /*//////////////////////////////////////////////////////////////
                                PAUSE
    //////////////////////////////////////////////////////////////*/

    function test_deposit_revertsWhenPaused() public {
        vault.pause();
        cash.mint(ALICE, 100 ether);
        vm.startPrank(ALICE);
        cash.approve(address(vault), type(uint256).max);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.deposit(100 ether, ALICE);
        vm.stopPrank();
    }

    function test_withdraw_allowedWhenPaused() public {
        uint256 shares = _depositFrom(ALICE, 100 ether);
        vault.pause();
        // Users can still exit while paused.
        vm.prank(ALICE);
        uint256 out = vault.redeem(shares, ALICE, ALICE);
        assertEq(out, 100 ether);
    }

    /*//////////////////////////////////////////////////////////////
                              HARVEST FEES
    //////////////////////////////////////////////////////////////*/

    function test_harvestFees_splitsAndFundsDistributor() public {
        _depositFrom(ALICE, 1_000 ether);
        // Deposit primes the high-water mark to contributed capital.
        assertEq(vault.highWaterMark(), 1_000 ether);

        // Simulate a NAV gain via a direct cash inflow (e.g. realized PnL).
        cash.mint(address(vault), 100 ether); // NAV now 1_100 ether, gain 100
        uint256 expectedFee = (uint256(100 ether) * TAKE_RATE_BPS) / 10_000; // 10 ether
        uint256 expectedAgent = expectedFee / 2; // 5 ether
        uint256 expectedProtocol = expectedFee - expectedAgent; // 5 ether
        uint64 epoch = ledger.epoch();

        vault.harvestFees();

        assertEq(cash.balanceOf(FEE_RECIPIENT), expectedProtocol, "protocol fee paid");
        assertEq(dist.epochPool(epoch), expectedAgent, "agent fee funded into distributor");
        assertEq(cash.balanceOf(address(dist)), expectedAgent, "distributor holds agent fee");
        assertEq(vault.highWaterMark(), 1_100 ether - expectedFee, "HWM advanced to post-fee NAV");
    }

    function test_harvestFees_noFeeBelowHighWaterMark() public {
        _depositFrom(ALICE, 1_000 ether); // HWM primed to 1000
        // No gain.
        vault.harvestFees();
        assertEq(cash.balanceOf(FEE_RECIPIENT), 0);
        assertEq(vault.highWaterMark(), 1_000 ether);
    }

    function test_harvestFees_onlyOwner() public {
        vm.prank(ALICE);
        vm.expectRevert(Ownable2Step.NotOwner.selector);
        vault.harvestFees();
    }

    /*//////////////////////////////////////////////////////////////
                              REENTRANCY
    //////////////////////////////////////////////////////////////*/

    function test_reentrancy_onWithdrawReverts() public {
        // Deploy a vault whose underlying asset is a malicious token that reenters
        // the vault during transfer-out on withdrawal.
        ReentrantToken evil = new ReentrantToken();
        SibylVault evilVault = new SibylVault(
            IERC20(address(evil)),
            ISibylLedger(address(ledger)),
            IExecutionVenue(address(venue)),
            IRewardDistributor(address(dist)),
            FEE_RECIPIENT,
            TAKE_RATE_BPS
        );

        ReentrantAttacker attacker = new ReentrantAttacker(evilVault, evil);
        evil.mint(address(attacker), 100 ether);
        attacker.deposit(100 ether);
        evil.setTarget(evilVault, address(attacker));

        // Withdraw triggers the malicious transfer hook, which reenters the guarded
        // withdraw path; the nonReentrant guard must make the whole call revert.
        vm.expectRevert(ReentrancyGuard.Reentrancy.selector);
        attacker.attack();
    }
}

/// @notice ERC20 whose transfer reenters a target vault, used to prove the guard.
contract ReentrantToken is IERC20 {
    string public name = "Evil";
    string public symbol = "EVIL";
    uint8 public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    SibylVault internal target;
    address internal attacker;
    bool internal reentering;

    function setTarget(SibylVault target_, address attacker_) external {
        target = target_;
        attacker = attacker_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        // On the withdrawal transfer-out, reenter the vault once.
        if (address(target) != address(0) && !reentering && msg.sender == address(target)) {
            reentering = true;
            // Reenter a guarded path with a fixed nonzero amount; the nonReentrant
            // guard must revert before any state change.
            target.withdraw(1, attacker, attacker);
        }
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "ALLOWANCE");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "BALANCE");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// @notice Helper that holds shares and kicks off the reentrant withdrawal.
contract ReentrantAttacker {
    SibylVault internal immutable vault;
    ReentrantToken internal immutable token;

    constructor(SibylVault vault_, ReentrantToken token_) {
        vault = vault_;
        token = token_;
    }

    function deposit(uint256 amount) external {
        token.approve(address(vault), type(uint256).max);
        vault.deposit(amount, address(this));
    }

    function attack() external {
        vault.redeem(vault.balanceOf(address(this)), address(this), address(this));
    }
}
