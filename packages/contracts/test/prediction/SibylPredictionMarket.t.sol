// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {SibylPredictionMarket} from "../../src/prediction/SibylPredictionMarket.sol";
import {OutcomeToken} from "../../src/prediction/OutcomeToken.sol";
import {TestUSD} from "../../src/tokens/TestUSD.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";

contract SibylPredictionMarketTest is Test {
    SibylPredictionMarket internal market;
    TestUSD internal usd;

    address internal agent = makeAddr("agent"); // permissionless creator (not owner)
    address internal resolver = makeAddr("resolver");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    bytes32 internal constant MID = keccak256("will-X-happen");
    bytes32 internal constant QH = keccak256("question?");
    uint64 internal resolveTime;

    function setUp() public {
        market = new SibylPredictionMarket();
        usd = new TestUSD();
        resolveTime = uint64(block.timestamp + 7 days);

        usd.mint(alice, 1_000e18);
        usd.mint(bob, 1_000e18);

        vm.prank(alice);
        usd.approve(address(market), type(uint256).max);
        vm.prank(bob);
        usd.approve(address(market), type(uint256).max);
    }

    function _create() internal {
        vm.prank(agent); // an arbitrary, non-owner address creates the market
        market.createMarket(MID, address(usd), QH, resolveTime, resolver);
    }

    function _yesNo() internal view returns (OutcomeToken y, OutcomeToken n) {
        (address ya, address na) = market.tokens(MID);
        return (OutcomeToken(ya), OutcomeToken(na));
    }

    /* -------------------------------------------------------------------------- */
    /*                                  CREATION                                  */
    /* -------------------------------------------------------------------------- */

    function test_createMarket_permissionless() public {
        _create();
        (IERC20 coll,,, bytes32 qh, uint64 rt, address res, SibylPredictionMarket.Outcome o, bool resolved, bool exists)
        = market.markets(MID);
        assertEq(address(coll), address(usd));
        assertEq(qh, QH);
        assertEq(rt, resolveTime);
        assertEq(res, resolver);
        assertEq(uint8(o), uint8(SibylPredictionMarket.Outcome.UNRESOLVED));
        assertFalse(resolved);
        assertTrue(exists);
    }

    function test_createMarket_revertDuplicate() public {
        _create();
        vm.prank(agent);
        vm.expectRevert(SibylPredictionMarket.MarketExists.selector);
        market.createMarket(MID, address(usd), QH, resolveTime, resolver);
    }

    function test_createMarket_revertZeroCollateral() public {
        vm.expectRevert(SibylPredictionMarket.ZeroAddress.selector);
        market.createMarket(MID, address(0), QH, resolveTime, resolver);
    }

    function test_createMarket_revertZeroResolver() public {
        vm.expectRevert(SibylPredictionMarket.ZeroAddress.selector);
        market.createMarket(MID, address(usd), QH, resolveTime, address(0));
    }

    function test_createMarket_revertPastResolveTime() public {
        vm.expectRevert(SibylPredictionMarket.ResolveTimeInPast.selector);
        market.createMarket(MID, address(usd), QH, uint64(block.timestamp), resolver);
    }

    function test_outcomeTokens_onlyMarketCanMint() public {
        _create();
        (OutcomeToken y,) = _yesNo();
        assertEq(y.market(), address(market));
        vm.expectRevert(OutcomeToken.OnlyMarket.selector);
        y.mint(alice, 1e18);
        vm.expectRevert(OutcomeToken.OnlyMarket.selector);
        y.burn(alice, 1e18);
    }

    /* -------------------------------------------------------------------------- */
    /*                              MINT / REDEEM SET                             */
    /* -------------------------------------------------------------------------- */

    function test_mintSet_conservation() public {
        _create();
        (OutcomeToken y, OutcomeToken n) = _yesNo();

        uint256 amt = 100e18;
        uint256 balBefore = usd.balanceOf(alice);
        vm.prank(alice);
        market.mintSet(MID, amt);

        assertEq(y.balanceOf(alice), amt);
        assertEq(n.balanceOf(alice), amt);
        assertEq(usd.balanceOf(alice), balBefore - amt);
        assertEq(usd.balanceOf(address(market)), amt);
    }

    function test_redeemSet_conservation() public {
        _create();
        (OutcomeToken y, OutcomeToken n) = _yesNo();
        uint256 amt = 100e18;

        vm.startPrank(alice);
        market.mintSet(MID, amt);
        uint256 balMid = usd.balanceOf(alice);
        market.redeemSet(MID, amt);
        vm.stopPrank();

        assertEq(y.balanceOf(alice), 0);
        assertEq(n.balanceOf(alice), 0);
        assertEq(usd.balanceOf(alice), balMid + amt);
        assertEq(usd.balanceOf(address(market)), 0);
    }

    function test_mintSet_revertZero() public {
        _create();
        vm.prank(alice);
        vm.expectRevert(SibylPredictionMarket.ZeroAmount.selector);
        market.mintSet(MID, 0);
    }

    function test_mintSet_revertUnknownMarket() public {
        vm.prank(alice);
        vm.expectRevert(SibylPredictionMarket.MarketUnknown.selector);
        market.mintSet(keccak256("nope"), 1e18);
    }

    /* -------------------------------------------------------------------------- */
    /*                                 RESOLUTION                                 */
    /* -------------------------------------------------------------------------- */

    function test_resolve_onlyResolver() public {
        _create();
        vm.warp(resolveTime + 1);
        vm.prank(alice);
        vm.expectRevert(SibylPredictionMarket.NotResolver.selector);
        market.resolve(MID, SibylPredictionMarket.Outcome.YES);
    }

    function test_resolve_onlyAfterResolveTime() public {
        _create();
        vm.prank(resolver);
        vm.expectRevert(SibylPredictionMarket.TooEarly.selector);
        market.resolve(MID, SibylPredictionMarket.Outcome.YES);
    }

    function test_resolve_onlyOnce() public {
        _create();
        vm.warp(resolveTime + 1);
        vm.startPrank(resolver);
        market.resolve(MID, SibylPredictionMarket.Outcome.YES);
        vm.expectRevert(SibylPredictionMarket.AlreadyResolved.selector);
        market.resolve(MID, SibylPredictionMarket.Outcome.NO);
        vm.stopPrank();
    }

    function test_resolve_rejectUnresolvedOutcome() public {
        _create();
        vm.warp(resolveTime + 1);
        vm.prank(resolver);
        vm.expectRevert(SibylPredictionMarket.InvalidOutcome.selector);
        market.resolve(MID, SibylPredictionMarket.Outcome.UNRESOLVED);
    }

    /* -------------------------------------------------------------------------- */
    /*                                  REDEEM                                    */
    /* -------------------------------------------------------------------------- */

    function test_redeem_yesWins() public {
        _create();
        (OutcomeToken y, OutcomeToken n) = _yesNo();

        // Alice mints a set, sells her NO to Bob (simulate by transfer).
        vm.startPrank(alice);
        market.mintSet(MID, 100e18);
        n.transfer(bob, 100e18);
        vm.stopPrank();

        vm.warp(resolveTime + 1);
        vm.prank(resolver);
        market.resolve(MID, SibylPredictionMarket.Outcome.YES);

        // Alice (YES holder) redeems for full collateral.
        uint256 aBefore = usd.balanceOf(alice);
        vm.prank(alice);
        market.redeem(MID);
        assertEq(usd.balanceOf(alice), aBefore + 100e18);
        assertEq(y.balanceOf(alice), 0);

        // Bob (NO holder) gets nothing.
        vm.prank(bob);
        vm.expectRevert(SibylPredictionMarket.NothingToRedeem.selector);
        market.redeem(MID);
    }

    function test_redeem_noWins() public {
        _create();
        (, OutcomeToken n) = _yesNo();
        vm.prank(alice);
        market.mintSet(MID, 50e18);

        vm.warp(resolveTime + 1);
        vm.prank(resolver);
        market.resolve(MID, SibylPredictionMarket.Outcome.NO);

        uint256 before = usd.balanceOf(alice);
        vm.prank(alice);
        market.redeem(MID);
        // Alice held both YES and NO; NO wins -> 50 collateral, YES worthless.
        assertEq(usd.balanceOf(alice), before + 50e18);
        assertEq(n.balanceOf(alice), 0);
    }

    function test_redeem_invalidSplitsHalf() public {
        _create();
        vm.prank(alice);
        market.mintSet(MID, 80e18);

        vm.warp(resolveTime + 1);
        vm.prank(resolver);
        market.resolve(MID, SibylPredictionMarket.Outcome.INVALID);

        uint256 before = usd.balanceOf(alice);
        vm.prank(alice);
        market.redeem(MID);
        // 80 YES + 80 NO at 0.5 each = 80 collateral back (the full set).
        assertEq(usd.balanceOf(alice), before + 80e18);
    }

    function test_redeem_revertBeforeResolution() public {
        _create();
        vm.prank(alice);
        market.mintSet(MID, 10e18);
        vm.prank(alice);
        vm.expectRevert(SibylPredictionMarket.NotResolved.selector);
        market.redeem(MID);
    }

    function test_redeemSet_worksAfterResolution() public {
        _create();
        vm.prank(alice);
        market.mintSet(MID, 30e18);
        vm.warp(resolveTime + 1);
        vm.prank(resolver);
        market.resolve(MID, SibylPredictionMarket.Outcome.YES);
        // redeemSet is outcome-agnostic and still works.
        uint256 before = usd.balanceOf(alice);
        vm.prank(alice);
        market.redeemSet(MID, 30e18);
        assertEq(usd.balanceOf(alice), before + 30e18);
    }
}
