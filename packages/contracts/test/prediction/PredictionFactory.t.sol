// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {SibylPredictionMarket} from "../../src/prediction/SibylPredictionMarket.sol";
import {PredictionFactory} from "../../src/prediction/PredictionFactory.sol";
import {OutcomeFPMM} from "../../src/prediction/OutcomeFPMM.sol";
import {OutcomeToken} from "../../src/prediction/OutcomeToken.sol";
import {TestUSD} from "../../src/tokens/TestUSD.sol";

contract PredictionFactoryTest is Test {
    SibylPredictionMarket internal market;
    PredictionFactory internal factory;
    TestUSD internal usd;

    address internal creator = makeAddr("creator");
    address internal trader = makeAddr("trader");
    address internal resolver = makeAddr("resolver");

    bytes32 internal constant MID = keccak256("factory-market");
    bytes32 internal constant MID2 = keccak256("factory-market-2");
    uint64 internal resolveTime;

    SibylPredictionMarket.Outcome internal YES = SibylPredictionMarket.Outcome.YES;
    SibylPredictionMarket.Outcome internal NO = SibylPredictionMarket.Outcome.NO;

    function setUp() public {
        market = new SibylPredictionMarket();
        factory = new PredictionFactory(market);
        usd = new TestUSD();
        resolveTime = uint64(block.timestamp + 7 days);

        usd.mint(creator, 1_000_000e18);
        usd.mint(trader, 1_000_000e18);

        vm.prank(creator);
        usd.approve(address(factory), type(uint256).max);
    }

    /* -------------------------------------------------------------------------- */
    /*                               CREATE + SEED                                */
    /* -------------------------------------------------------------------------- */

    function test_createAndSeed_balancedReservesAndPrice() public {
        vm.prank(creator);
        address fpmm = factory.createAndSeed(
            MID, address(usd), keccak256("q"), resolveTime, resolver, 1000e18
        );
        OutcomeFPMM pool = OutcomeFPMM(fpmm);

        assertEq(pool.reserveYES(), 1000e18);
        assertEq(pool.reserveNO(), 1000e18);
        assertEq(pool.priceYES(), 0.5e18);
        assertEq(pool.priceNO(), 0.5e18);
        assertEq(pool.priceYES() + pool.priceNO(), 1e18);
    }

    function test_createAndSeed_lpSharesGoToCreatorNotFactory() public {
        vm.prank(creator);
        address fpmm = factory.createAndSeed(
            MID, address(usd), keccak256("q"), resolveTime, resolver, 1000e18
        );
        OutcomeFPMM pool = OutcomeFPMM(fpmm);

        // Creator owns the initial liquidity; factory holds nothing.
        assertEq(pool.balanceOf(creator), 1000e18);
        assertEq(pool.balanceOf(address(factory)), 0);
        assertEq(pool.totalSupply(), 1000e18);
    }

    function test_createAndSeed_pullsExactCollateralFromCreator() public {
        uint256 before = usd.balanceOf(creator);
        vm.prank(creator);
        factory.createAndSeed(MID, address(usd), keccak256("q"), resolveTime, resolver, 1000e18);
        assertEq(usd.balanceOf(creator), before - 1000e18);
        // Collateral lives in the controller backing the complete set.
        assertEq(usd.balanceOf(address(factory)), 0);
        assertEq(usd.balanceOf(address(market)), 1000e18);
    }

    function test_createAndSeed_populatesRegistry() public {
        vm.prank(creator);
        address fpmm = factory.createAndSeed(
            MID, address(usd), keccak256("q"), resolveTime, resolver, 1000e18
        );

        assertEq(factory.fpmmOf(MID), fpmm);
        assertEq(factory.allMarketIdsCount(), 1);
        assertEq(factory.allMarketIds(0), MID);
    }

    function test_createAndSeed_marketTradeable() public {
        vm.prank(creator);
        address fpmm = factory.createAndSeed(
            MID, address(usd), keccak256("q"), resolveTime, resolver, 1000e18
        );
        OutcomeFPMM pool = OutcomeFPMM(fpmm);
        (address ya, address na) = market.tokens(MID);
        OutcomeToken yes = OutcomeToken(ya);
        OutcomeToken no = OutcomeToken(na);

        // mintSet directly on the new market.
        vm.startPrank(trader);
        usd.approve(address(market), type(uint256).max);
        market.mintSet(MID, 100e18);
        assertEq(yes.balanceOf(trader), 100e18);
        assertEq(no.balanceOf(trader), 100e18);

        // redeemSet round-trips collateral.
        uint256 beforeRedeem = usd.balanceOf(trader);
        market.redeemSet(MID, 40e18);
        assertEq(usd.balanceOf(trader), beforeRedeem + 40e18);
        vm.stopPrank();

        // buy works on the seeded pool.
        vm.startPrank(trader);
        usd.approve(address(pool), type(uint256).max);
        uint256 pBefore = pool.priceYES();
        uint256 out = pool.buy(YES, 200e18, 0);
        vm.stopPrank();
        assertGt(out, 200e18);
        assertEq(yes.balanceOf(trader), 60e18 + out); // 100 minted - 40 redeemed + bought
        assertGt(pool.priceYES(), pBefore);
    }

    /* -------------------------------------------------------------------------- */
    /*                            CREATE (NO SEED)                                */
    /* -------------------------------------------------------------------------- */

    function test_createMarket_noSeedEmptyReserves() public {
        vm.prank(creator);
        address fpmm = factory.createMarket(MID, address(usd), keccak256("q"), resolveTime, resolver);
        OutcomeFPMM pool = OutcomeFPMM(fpmm);

        assertEq(pool.reserveYES(), 0);
        assertEq(pool.reserveNO(), 0);
        assertEq(pool.totalSupply(), 0);
        assertEq(factory.fpmmOf(MID), fpmm);
        assertEq(factory.allMarketIdsCount(), 1);
        // No collateral moved.
        assertEq(usd.balanceOf(creator), 1_000_000e18);
    }

    function test_createMarket_canSeedAndTradeAfterwards() public {
        vm.prank(creator);
        address fpmm = factory.createMarket(MID, address(usd), keccak256("q"), resolveTime, resolver);
        OutcomeFPMM pool = OutcomeFPMM(fpmm);

        // Anyone can fund the empty pool directly afterwards.
        vm.startPrank(trader);
        usd.approve(address(pool), type(uint256).max);
        pool.addFunding(500e18);
        vm.stopPrank();
        assertEq(pool.priceYES(), 0.5e18);
        assertEq(pool.balanceOf(trader), 500e18);
    }

    /* -------------------------------------------------------------------------- */
    /*                                  REGISTRY                                  */
    /* -------------------------------------------------------------------------- */

    function test_multipleMarketsTrackedInOrder() public {
        vm.startPrank(creator);
        factory.createAndSeed(MID, address(usd), keccak256("q1"), resolveTime, resolver, 100e18);
        factory.createMarket(MID2, address(usd), keccak256("q2"), resolveTime, resolver);
        vm.stopPrank();

        assertEq(factory.allMarketIdsCount(), 2);
        assertEq(factory.allMarketIds(0), MID);
        assertEq(factory.allMarketIds(1), MID2);
    }

    /* -------------------------------------------------------------------------- */
    /*                                   GUARDS                                   */
    /* -------------------------------------------------------------------------- */

    function test_duplicateMarketIdReverts() public {
        vm.startPrank(creator);
        factory.createAndSeed(MID, address(usd), keccak256("q"), resolveTime, resolver, 100e18);
        vm.expectRevert(SibylPredictionMarket.MarketExists.selector);
        factory.createMarket(MID, address(usd), keccak256("q"), resolveTime, resolver);
        vm.stopPrank();
    }

    function test_constructor_revertZeroPredictionMarket() public {
        vm.expectRevert(PredictionFactory.ZeroAddress.selector);
        new PredictionFactory(SibylPredictionMarket(address(0)));
    }
}
