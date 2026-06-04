// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PredictionVenue} from "../../src/venues/PredictionVenue.sol";
import {SibylPredictionMarket} from "../../src/prediction/SibylPredictionMarket.sol";
import {OutcomeFPMM} from "../../src/prediction/OutcomeFPMM.sol";
import {OutcomeToken} from "../../src/prediction/OutcomeToken.sol";
import {TestUSD} from "../../src/tokens/TestUSD.sol";
import {Ownable2Step} from "../../src/access/Ownable2Step.sol";

contract PredictionVenueTest is Test {
    PredictionVenue internal venue;
    SibylPredictionMarket internal market;
    OutcomeFPMM internal pool;
    TestUSD internal usd;
    OutcomeToken internal yes;
    OutcomeToken internal no;

    address internal owner = address(this);
    address internal vault = makeAddr("vault");
    address internal lp = makeAddr("lp");
    address internal resolver = makeAddr("resolver");

    bytes32 internal constant MID = keccak256("pv-market");
    uint64 internal resolveTime;

    uint8 internal constant FLAT = 0;
    uint8 internal constant LONG = 1;
    uint8 internal constant SHORT = 2;

    SibylPredictionMarket.Outcome internal YES = SibylPredictionMarket.Outcome.YES;
    SibylPredictionMarket.Outcome internal NO = SibylPredictionMarket.Outcome.NO;

    function setUp() public {
        market = new SibylPredictionMarket();
        usd = new TestUSD();
        resolveTime = uint64(block.timestamp + 7 days);

        market.createMarket(MID, address(usd), keccak256("q"), resolveTime, resolver);
        pool = new OutcomeFPMM(market, MID);
        (address ya, address na) = market.tokens(MID);
        yes = OutcomeToken(ya);
        no = OutcomeToken(na);

        // Seed the FPMM with balanced liquidity.
        usd.mint(lp, 1_000_000e18);
        vm.startPrank(lp);
        usd.approve(address(pool), type(uint256).max);
        pool.addFunding(100_000e18);
        vm.stopPrank();

        venue = new PredictionVenue(owner);
        venue.setMarket(MID, address(market), address(pool), address(usd));

        // Fund the vault and approve the venue to pull collateral.
        usd.mint(vault, 1_000_000e18);
        vm.prank(vault);
        usd.approve(address(venue), type(uint256).max);
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR / ADMIN
    //////////////////////////////////////////////////////////////*/

    function test_Constructor_AssignsOwner() public {
        PredictionVenue v = new PredictionVenue(vault);
        assertEq(v.owner(), vault);
        assertEq(venue.positionToken(), address(0));
    }

    function test_SetMarket_OwnerOnly() public {
        vm.prank(vault);
        vm.expectRevert(Ownable2Step.NotOwner.selector);
        venue.setMarket(MID, address(market), address(pool), address(usd));
    }

    function test_SetMarket_RevertsZeroAddress() public {
        vm.expectRevert(PredictionVenue.ZeroAddress.selector);
        venue.setMarket(MID, address(0), address(pool), address(usd));
        vm.expectRevert(PredictionVenue.ZeroAddress.selector);
        venue.setMarket(MID, address(market), address(0), address(usd));
        vm.expectRevert(PredictionVenue.ZeroAddress.selector);
        venue.setMarket(MID, address(market), address(pool), address(0));
    }

    function test_SetMarket_StoresConfig() public view {
        (SibylPredictionMarket pm, OutcomeFPMM fp, , bool configured) = venue.markets(MID);
        assertEq(address(pm), address(market));
        assertEq(address(fp), address(pool));
        assertTrue(configured);
    }

    /*//////////////////////////////////////////////////////////////
                              openPosition
    //////////////////////////////////////////////////////////////*/

    function test_Open_LongBuysYes() public {
        uint256 amountIn = 1_000e18;
        uint256 expected = pool.calcBuyAmount(YES, amountIn);

        uint256 vaultBefore = usd.balanceOf(vault);
        vm.prank(vault);
        uint256 received = venue.openPosition(MID, LONG, amountIn, 0, block.timestamp + 1);

        assertEq(received, expected);
        assertEq(venue.heldBalance(MID), expected);
        assertTrue(venue.heldIsYes(MID));
        // Venue holds the YES shares.
        assertEq(yes.balanceOf(address(venue)), expected);
        // Collateral pulled from vault.
        assertEq(usd.balanceOf(vault), vaultBefore - amountIn);
    }

    function test_Open_ShortBuysNo() public {
        uint256 amountIn = 1_000e18;
        uint256 expected = pool.calcBuyAmount(NO, amountIn);

        vm.prank(vault);
        uint256 received = venue.openPosition(MID, SHORT, amountIn, 0, block.timestamp + 1);

        assertEq(received, expected);
        assertEq(venue.heldBalance(MID), expected);
        assertFalse(venue.heldIsYes(MID));
        assertEq(no.balanceOf(address(venue)), expected);
    }

    function test_Open_RevertsFlat() public {
        vm.prank(vault);
        vm.expectRevert(PredictionVenue.NotLongOrShort.selector);
        venue.openPosition(MID, FLAT, 1e18, 0, block.timestamp + 1);
    }

    function test_Open_RevertsZeroAmount() public {
        vm.prank(vault);
        vm.expectRevert(PredictionVenue.ZeroAmount.selector);
        venue.openPosition(MID, LONG, 0, 0, block.timestamp + 1);
    }

    function test_Open_RevertsPastDeadline() public {
        vm.warp(1000);
        vm.prank(vault);
        vm.expectRevert(PredictionVenue.PastDeadline.selector);
        venue.openPosition(MID, LONG, 1e18, 0, 999);
    }

    function test_Open_RevertsUnconfigured() public {
        bytes32 unknown = keccak256("unknown");
        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(PredictionVenue.MarketNotConfigured.selector, unknown));
        venue.openPosition(unknown, LONG, 1e18, 0, block.timestamp + 1);
    }

    function test_Open_RevertsSlippage() public {
        uint256 amountIn = 1_000e18;
        uint256 expected = pool.calcBuyAmount(YES, amountIn);
        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(OutcomeFPMM.SlippageBuy.selector, expected, expected + 1));
        venue.openPosition(MID, LONG, amountIn, expected + 1, block.timestamp + 1);
    }

    function test_Open_RevertsSideMismatch() public {
        vm.prank(vault);
        venue.openPosition(MID, LONG, 1_000e18, 0, block.timestamp + 1);
        // Now attempt the opposite side while still holding YES.
        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(PredictionVenue.SideMismatch.selector, MID));
        venue.openPosition(MID, SHORT, 1_000e18, 0, block.timestamp + 1);
    }

    function test_Open_AccumulatesSameSide() public {
        vm.prank(vault);
        uint256 r1 = venue.openPosition(MID, LONG, 500e18, 0, block.timestamp + 1);
        vm.prank(vault);
        uint256 r2 = venue.openPosition(MID, LONG, 500e18, 0, block.timestamp + 1);
        assertEq(venue.heldBalance(MID), r1 + r2);
    }

    /*//////////////////////////////////////////////////////////////
                             closePosition
    //////////////////////////////////////////////////////////////*/

    function test_Close_SellsYesForCollateral() public {
        vm.prank(vault);
        uint256 shares = venue.openPosition(MID, LONG, 2_000e18, 0, block.timestamp + 1);

        uint256 vaultBefore = usd.balanceOf(vault);
        uint256 sellShares = shares / 2;

        vm.prank(vault);
        uint256 received = venue.closePosition(MID, sellShares, 0, block.timestamp + 1);

        assertGt(received, 0);
        // Vault got collateral back.
        assertEq(usd.balanceOf(vault), vaultBefore + received);
        // Held reduced by at most the shares requested.
        assertLe(venue.heldBalance(MID), shares);
        assertGe(venue.heldBalance(MID), shares - sellShares);
    }

    function test_Close_FullRoundTrip() public {
        vm.prank(vault);
        uint256 shares = venue.openPosition(MID, LONG, 1_000e18, 0, block.timestamp + 1);

        vm.prank(vault);
        uint256 received = venue.closePosition(MID, shares, 0, block.timestamp + 1);
        // Round trip on a balanced-ish pool returns close to (but <=) the input collateral.
        assertGt(received, 0);
        assertLe(received, 1_000e18 + 1);
    }

    function test_Close_RevertsZeroAmount() public {
        vm.prank(vault);
        vm.expectRevert(PredictionVenue.ZeroAmount.selector);
        venue.closePosition(MID, 0, 0, block.timestamp + 1);
    }

    function test_Close_RevertsPastDeadline() public {
        vm.prank(vault);
        venue.openPosition(MID, LONG, 1_000e18, 0, block.timestamp + 1);
        vm.warp(block.timestamp + 100);
        vm.prank(vault);
        vm.expectRevert(PredictionVenue.PastDeadline.selector);
        venue.closePosition(MID, 1e18, 0, block.timestamp - 1);
    }

    function test_Close_RevertsInsufficientHeld() public {
        vm.prank(vault);
        uint256 shares = venue.openPosition(MID, LONG, 1_000e18, 0, block.timestamp + 1);
        vm.prank(vault);
        vm.expectRevert(
            abi.encodeWithSelector(PredictionVenue.InsufficientHeld.selector, MID, shares, shares + 1)
        );
        venue.closePosition(MID, shares + 1, 0, block.timestamp + 1);
    }

    function test_Close_RevertsSlippage() public {
        vm.prank(vault);
        uint256 shares = venue.openPosition(MID, LONG, 1_000e18, 0, block.timestamp + 1);
        // Demand an absurd minOut so the close reverts on slippage.
        vm.prank(vault);
        vm.expectRevert();
        venue.closePosition(MID, shares, 1_000_000e18, block.timestamp + 1);
    }

    /*//////////////////////////////////////////////////////////////
                             positionValue
    //////////////////////////////////////////////////////////////*/

    function test_PositionValue_ZeroWhenNoHeld() public view {
        assertEq(venue.positionValue(MID), 0);
    }

    function test_PositionValue_UnresolvedMarksToFpmmPrice() public {
        vm.prank(vault);
        uint256 shares = venue.openPosition(MID, LONG, 1_000e18, 0, block.timestamp + 1);

        uint256 price = pool.priceYES();
        uint256 expected = (shares * price) / 1e18;
        assertEq(venue.positionValue(MID), expected);
        // The position is worth less than the shares count (P(YES) < 1).
        assertLt(venue.positionValue(MID), shares);
    }

    function test_PositionValue_ResolvedWinningSide1to1() public {
        vm.prank(vault);
        uint256 shares = venue.openPosition(MID, LONG, 1_000e18, 0, block.timestamp + 1);

        vm.warp(resolveTime + 1);
        vm.prank(resolver);
        market.resolve(MID, YES);

        // YES held, resolved YES -> 1:1.
        assertEq(venue.positionValue(MID), shares);
    }

    function test_PositionValue_ResolvedLosingSideZero() public {
        vm.prank(vault);
        venue.openPosition(MID, LONG, 1_000e18, 0, block.timestamp + 1);

        vm.warp(resolveTime + 1);
        vm.prank(resolver);
        market.resolve(MID, NO);

        // YES held, resolved NO -> worthless.
        assertEq(venue.positionValue(MID), 0);
    }

    function test_PositionValue_ResolvedInvalidHalf() public {
        vm.prank(vault);
        uint256 shares = venue.openPosition(MID, LONG, 1_000e18, 0, block.timestamp + 1);

        vm.warp(resolveTime + 1);
        vm.prank(resolver);
        market.resolve(MID, SibylPredictionMarket.Outcome.INVALID);

        assertEq(venue.positionValue(MID), shares / 2);
    }

    function test_PositionValue_ShortResolvedNoWins() public {
        vm.prank(vault);
        uint256 shares = venue.openPosition(MID, SHORT, 1_000e18, 0, block.timestamp + 1);

        vm.warp(resolveTime + 1);
        vm.prank(resolver);
        market.resolve(MID, NO);

        // NO held, resolved NO -> 1:1.
        assertEq(venue.positionValue(MID), shares);
    }

    /*//////////////////////////////////////////////////////////////
                           REENTRANCY GUARD
    //////////////////////////////////////////////////////////////*/

    function test_ReentrancyGuard_BlocksReentrantOpen() public {
        // A malicious collateral token re-enters openPosition during transferFrom.
        ReentrantToken evil = new ReentrantToken();
        SibylPredictionMarket m2 = new SibylPredictionMarket();
        bytes32 mid2 = keccak256("evil");
        m2.createMarket(mid2, address(evil), keccak256("q2"), uint64(block.timestamp + 7 days), resolver);
        OutcomeFPMM pool2 = new OutcomeFPMM(m2, mid2);

        venue.setMarket(mid2, address(m2), address(pool2), address(evil));
        evil.arm(
            address(venue),
            abi.encodeCall(PredictionVenue.openPosition, (mid2, LONG, 1e18, 0, type(uint256).max))
        );
        evil.mint(vault, 1_000e18);
        vm.prank(vault);
        // The re-entrant inner call hits the nonReentrant guard; the revert bubbles.
        vm.expectRevert();
        venue.openPosition(mid2, LONG, 100e18, 0, block.timestamp + 1);

        assertEq(venue.heldBalance(mid2), 0);
    }
}

/// @dev TEST-ONLY ERC20 that re-enters a target on `transferFrom` to exercise the
///      venue's reentrancy guard.
contract ReentrantToken {
    string public name = "Evil";
    string public symbol = "EVL";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address internal target;
    bytes internal payload;
    bool internal firing;

    function arm(address target_, bytes calldata payload_) external {
        target = target_;
        payload = payload_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (target != address(0) && !firing) {
            firing = true;
            (bool ok, bytes memory ret) = target.call(payload);
            if (!ok) {
                assembly {
                    revert(add(ret, 0x20), mload(ret))
                }
            }
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
