// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {MockERC20} from "./MockERC20.sol";
import {MockExecutionVenue} from "./MockExecutionVenue.sol";

/// @title MockVenueSelfCheck
/// @notice Self-check for the test doubles {MockExecutionVenue} + {MockERC20}.
contract MockVenueSelfCheck is Test {
    MockERC20 internal cash;
    MockERC20 internal asset;
    MockExecutionVenue internal venue;

    bytes32 internal constant MARKET = keccak256("BTC-USD");
    uint8 internal constant FLAT = 0;
    uint8 internal constant LONG = 1;
    uint8 internal constant SHORT = 2;

    address internal trader = address(0xBEEF);

    function setUp() public {
        cash = new MockERC20();
        asset = new MockERC20();
        venue = new MockExecutionVenue(cash, asset);

        // Seed the venue with asset inventory and the trader with cash.
        asset.mint(address(venue), 1_000_000e18);
        cash.mint(trader, 1_000_000e18);

        vm.startPrank(trader);
        cash.approve(address(venue), type(uint256).max);
        asset.approve(address(venue), type(uint256).max);
        vm.stopPrank();
    }

    function test_OpenLong_RecordsPositionAndFills1to1() public {
        uint256 amountIn = 100e18;
        vm.prank(trader);
        uint256 received = venue.openPosition(MARKET, LONG, amountIn, amountIn, block.timestamp);

        assertEq(received, amountIn, "1:1 fill");
        assertEq(venue.positionValue(MARKET), amountIn, "notional recorded");
        // The venue holds the bought asset itself; the trader is not paid out.
        assertEq(venue.heldBalance(MARKET), amountIn, "venue holds the asset");
        assertEq(cash.balanceOf(address(venue)), amountIn, "venue got cash");
    }

    function test_ClosePosition_ReturnsCashAndReducesNotional() public {
        uint256 amountIn = 100e18;
        vm.startPrank(trader);
        venue.openPosition(MARKET, LONG, amountIn, amountIn, block.timestamp);

        uint256 cashBefore = cash.balanceOf(trader);
        // Closing draws from the venue's own held inventory (a market-token amount).
        uint256 received = venue.closePosition(MARKET, amountIn, amountIn, block.timestamp);
        vm.stopPrank();

        assertEq(received, amountIn, "1:1 close fill");
        assertEq(venue.positionValue(MARKET), 0, "notional cleared");
        assertEq(venue.heldBalance(MARKET), 0, "held inventory drained");
        assertEq(cash.balanceOf(trader), cashBefore + amountIn, "trader got cash back");
    }

    function test_OpenWithNonLong_Reverts() public {
        vm.startPrank(trader);
        vm.expectRevert(MockExecutionVenue.NotSpotLong.selector);
        venue.openPosition(MARKET, SHORT, 1e18, 1e18, block.timestamp);

        vm.expectRevert(MockExecutionVenue.NotSpotLong.selector);
        venue.openPosition(MARKET, FLAT, 1e18, 1e18, block.timestamp);
        vm.stopPrank();
    }

    function test_Open_SlippageRevert() public {
        vm.prank(trader);
        vm.expectRevert(MockExecutionVenue.SlippageExceeded.selector);
        venue.openPosition(MARKET, LONG, 100e18, 101e18, block.timestamp);
    }

    function test_Open_DeadlineRevert() public {
        vm.warp(1000);
        vm.prank(trader);
        vm.expectRevert(MockExecutionVenue.PastDeadline.selector);
        venue.openPosition(MARKET, LONG, 100e18, 100e18, block.timestamp - 1);
    }
}
