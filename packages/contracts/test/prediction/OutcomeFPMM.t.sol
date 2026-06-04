// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {SibylPredictionMarket} from "../../src/prediction/SibylPredictionMarket.sol";
import {OutcomeFPMM} from "../../src/prediction/OutcomeFPMM.sol";
import {OutcomeToken} from "../../src/prediction/OutcomeToken.sol";
import {TestUSD} from "../../src/tokens/TestUSD.sol";

contract OutcomeFPMMTest is Test {
    SibylPredictionMarket internal market;
    OutcomeFPMM internal pool;
    TestUSD internal usd;
    OutcomeToken internal yes;
    OutcomeToken internal no;

    address internal lp = makeAddr("lp");
    address internal trader = makeAddr("trader");
    address internal resolver = makeAddr("resolver");

    bytes32 internal constant MID = keccak256("fpmm-market");
    uint64 internal resolveTime;

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

        usd.mint(lp, 1_000_000e18);
        usd.mint(trader, 1_000_000e18);

        vm.prank(lp);
        usd.approve(address(pool), type(uint256).max);
        vm.prank(trader);
        usd.approve(address(pool), type(uint256).max);
    }

    function _seed(uint256 amt) internal {
        vm.prank(lp);
        pool.addFunding(amt);
    }

    /* -------------------------------------------------------------------------- */
    /*                                  FUNDING                                   */
    /* -------------------------------------------------------------------------- */

    function test_addFunding_seedsBalancedReserves() public {
        _seed(1000e18);
        assertEq(pool.reserveYES(), 1000e18);
        assertEq(pool.reserveNO(), 1000e18);
        assertEq(pool.balanceOf(lp), 1000e18);
        // 50/50 odds at seed.
        assertEq(pool.priceYES(), 0.5e18);
        assertEq(pool.priceNO(), 0.5e18);
        assertEq(pool.priceYES() + pool.priceNO(), 1e18);
    }

    function test_addFunding_preservesRatioAndRefundsSurplus() public {
        _seed(1000e18);
        // Skew the pool with a buy so reserves are uneven.
        vm.prank(trader);
        pool.buy(YES, 500e18, 0);
        uint256 ryBefore = pool.reserveYES();
        uint256 rnBefore = pool.reserveNO();
        assertTrue(ryBefore != rnBefore);

        // Second funder adds; ratio must be preserved.
        uint256 lp2Shares;
        vm.prank(lp);
        lp2Shares = pool.addFunding(1000e18);
        assertGt(lp2Shares, 0);

        // Ratio reserveYES/reserveNO preserved within rounding.
        uint256 r1 = (ryBefore * 1e18) / rnBefore;
        uint256 r2 = (pool.reserveYES() * 1e18) / pool.reserveNO();
        assertApproxEqAbs(r1, r2, 1e12);
    }

    function test_removeFunding_returnsValue() public {
        _seed(1000e18);
        uint256 shares = pool.balanceOf(lp);
        uint256 before = usd.balanceOf(lp);
        vm.prank(lp);
        uint256 out = pool.removeFunding(shares);
        // Balanced pool -> full collateral back, no leftover outcome tokens.
        assertEq(out, 1000e18);
        assertEq(usd.balanceOf(lp), before + 1000e18);
        assertEq(pool.reserveYES(), 0);
        assertEq(pool.reserveNO(), 0);
    }

    function test_removeFunding_afterSkewReturnsOutcomeTokens() public {
        _seed(1000e18);
        vm.prank(trader);
        pool.buy(YES, 300e18, 0);

        uint256 shares = pool.balanceOf(lp);
        vm.prank(lp);
        pool.removeFunding(shares);
        // Pool is YES-light after the buy, so LP keeps NO-heavy imbalance as tokens.
        assertGt(no.balanceOf(lp), 0);
        assertEq(pool.totalSupply(), 0);
    }

    /* -------------------------------------------------------------------------- */
    /*                                    BUY                                     */
    /* -------------------------------------------------------------------------- */

    function test_buy_movesPriceTowardOutcome() public {
        _seed(1000e18);
        uint256 pYesBefore = pool.priceYES();

        vm.prank(trader);
        uint256 out = pool.buy(YES, 200e18, 0);
        assertGt(out, 200e18); // got more YES shares than collateral spent
        assertEq(yes.balanceOf(trader), out);

        uint256 pYesAfter = pool.priceYES();
        assertGt(pYesAfter, pYesBefore); // buying YES raises P(YES)
        // Complementary prices still sum to 1.
        assertApproxEqAbs(pool.priceYES() + pool.priceNO(), 1e18, 2);
    }

    function test_buy_calcMatchesActual() public {
        _seed(1000e18);
        uint256 expected = pool.calcBuyAmount(NO, 150e18);
        vm.prank(trader);
        uint256 actual = pool.buy(NO, 150e18, expected);
        assertEq(actual, expected);
    }

    function test_buy_slippageRevert() public {
        _seed(1000e18);
        uint256 expected = pool.calcBuyAmount(YES, 100e18);
        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(OutcomeFPMM.SlippageBuy.selector, expected, expected + 1));
        pool.buy(YES, 100e18, expected + 1);
    }

    function test_buy_constantProductHolds() public {
        _seed(1000e18);
        uint256 kBefore = pool.reserveYES() * pool.reserveNO();
        vm.prank(trader);
        pool.buy(YES, 250e18, 0);
        uint256 kAfter = pool.reserveYES() * pool.reserveNO();
        // Constant product preserved (>= due to integer rounding favoring pool).
        assertGe(kAfter, kBefore);
        assertApproxEqRel(kAfter, kBefore, 1e12);
    }

    /* -------------------------------------------------------------------------- */
    /*                                    SELL                                    */
    /* -------------------------------------------------------------------------- */

    function test_sell_roundTrip() public {
        _seed(1000e18);
        // Trader buys YES first.
        vm.prank(trader);
        uint256 bought = pool.buy(YES, 200e18, 0);

        // Approve pool to pull YES on sell.
        vm.prank(trader);
        yes.approve(address(pool), type(uint256).max);

        uint256 usdBefore = usd.balanceOf(trader);
        uint256 collateralOut = 100e18;
        uint256 needed = pool.calcSellAmount(YES, collateralOut);
        assertLe(needed, bought);

        vm.prank(trader);
        uint256 spent = pool.sell(YES, collateralOut, needed);
        assertEq(spent, needed);
        assertEq(usd.balanceOf(trader), usdBefore + collateralOut);
    }

    function test_sell_slippageRevert() public {
        _seed(1000e18);
        vm.prank(trader);
        pool.buy(YES, 200e18, 0);
        vm.prank(trader);
        yes.approve(address(pool), type(uint256).max);

        uint256 needed = pool.calcSellAmount(YES, 50e18);
        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(OutcomeFPMM.SlippageSell.selector, needed, needed - 1));
        pool.sell(YES, 50e18, needed - 1);
    }

    function test_sell_movesPriceDown() public {
        _seed(1000e18);
        vm.startPrank(trader);
        pool.buy(YES, 400e18, 0);
        yes.approve(address(pool), type(uint256).max);
        uint256 pAfterBuy = pool.priceYES();
        pool.sell(YES, 200e18, type(uint256).max);
        vm.stopPrank();
        assertLt(pool.priceYES(), pAfterBuy); // selling YES lowers P(YES)
    }

    /* -------------------------------------------------------------------------- */
    /*                                   GUARDS                                   */
    /* -------------------------------------------------------------------------- */

    function test_buy_revertOnEmptyPool() public {
        vm.prank(trader);
        vm.expectRevert(OutcomeFPMM.PoolEmpty.selector);
        pool.buy(YES, 10e18, 0);
    }

    function test_addFunding_revertZero() public {
        vm.prank(lp);
        vm.expectRevert(OutcomeFPMM.ZeroAmount.selector);
        pool.addFunding(0);
    }

    function test_buy_revertNonBinaryOutcome() public {
        _seed(1000e18);
        vm.prank(trader);
        vm.expectRevert(OutcomeFPMM.NotBinaryOutcome.selector);
        pool.buy(SibylPredictionMarket.Outcome.INVALID, 10e18, 0);
    }
}
