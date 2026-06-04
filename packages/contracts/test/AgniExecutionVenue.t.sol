// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AgniExecutionVenue} from "../src/venues/AgniExecutionVenue.sol";
import {TestUSD} from "../src/tokens/TestUSD.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {StubAgniRouter, StubAgniV3Factory, StubAgniV3Pool} from "./mocks/StubAgniRouter.sol";
import {IAgniSwapRouter} from "../src/interfaces/IAgniSwapRouter.sol";

contract AgniExecutionVenueTest is Test {
    AgniExecutionVenue internal venue;
    TestUSD internal base; // sUSD base asset
    MockERC20 internal mkt; // market token
    StubAgniRouter internal router;
    StubAgniV3Factory internal factory;
    StubAgniV3Pool internal pool;

    uint256 internal constant Q96 = 0x1000000000000000000000000; // 2**96

    address internal owner = address(this);
    address internal vault = address(0xDEAD01);
    bytes32 internal constant MARKET = keccak256("ETH-USD");
    uint24 internal constant FEE = 3000;
    uint8 internal constant LONG = 1;
    uint8 internal constant FLAT = 0;
    uint8 internal constant SHORT = 2;

    function setUp() public {
        base = new TestUSD();
        mkt = new MockERC20();
        router = new StubAgniRouter();
        factory = new StubAgniV3Factory();
        // Start at a 1:1 spot price (sqrtPriceX96 == 2**96 => price 1.0).
        pool = new StubAgniV3Pool(uint160(Q96));
        factory.setPool(address(pool));

        venue = new AgniExecutionVenue(address(router), address(base), address(factory), owner);
        venue.setMarket(MARKET, address(mkt), FEE);

        // Fund the router with market-token inventory for opens and base for closes.
        mkt.mint(address(router), 1_000_000e18);
        base.mint(address(router), 1_000_000e18);

        // Fund the vault with base and approve the venue.
        base.mint(vault, 100_000e18);
        vm.prank(vault);
        base.approve(address(venue), type(uint256).max);
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @dev Mirrors the venue's price math for the (small) magnitudes used in tests,
    ///      where the intermediate products fit in 256 bits so plain arithmetic
    ///      matches the contract's 512-bit mulDiv exactly.
    function _expectedValue(uint256 held, uint160 sqrtPriceX96) internal view returns (uint256) {
        uint256 priceX96 = (uint256(sqrtPriceX96) * uint256(sqrtPriceX96)) / Q96;
        if (address(mkt) < address(base)) {
            return (held * priceX96) / Q96;
        } else {
            return (held * Q96) / priceX96;
        }
    }

    function test_Constructor_SetsOwnerAndImmutables() public view {
        assertEq(venue.owner(), owner);
        assertEq(address(venue.router()), address(router));
        assertEq(address(venue.factory()), address(factory));
        assertEq(venue.baseAsset(), address(base));
        assertEq(venue.positionToken(), address(0));
    }

    function test_Constructor_RevertsOnZeroAddress() public {
        vm.expectRevert(AgniExecutionVenue.ZeroAddress.selector);
        new AgniExecutionVenue(address(0), address(base), address(factory), owner);
        vm.expectRevert(AgniExecutionVenue.ZeroAddress.selector);
        new AgniExecutionVenue(address(router), address(0), address(factory), owner);
        vm.expectRevert(AgniExecutionVenue.ZeroAddress.selector);
        new AgniExecutionVenue(address(router), address(base), address(0), owner);
    }

    function test_Constructor_AssignsCustomOwner() public {
        AgniExecutionVenue v =
            new AgniExecutionVenue(address(router), address(base), address(factory), vault);
        assertEq(v.owner(), vault);
    }

    /*//////////////////////////////////////////////////////////////
                                setMarket
    //////////////////////////////////////////////////////////////*/

    function test_SetMarket_Permissionless() public {
        // setMarket is now permissionless: any address may wire a market that has
        // a real pool. (Factory returns a non-zero pool in setUp.)
        bytes32 m2 = keccak256("PERMISSIONLESS");
        vm.prank(vault);
        venue.setMarket(m2, address(mkt), FEE);
        (address t,, bool configured) = venue.markets(m2);
        assertEq(t, address(mkt));
        assertTrue(configured);
    }

    function test_SetMarket_RevertsNoPool() public {
        // No pool for this (base, marketToken, fee) triple -> NoPool.
        factory.setPool(address(0));
        vm.prank(vault);
        vm.expectRevert(AgniExecutionVenue.NoPool.selector);
        venue.setMarket(keccak256("NOPOOL"), address(mkt), FEE);
    }

    function test_SetMarket_RevertsZeroToken() public {
        vm.expectRevert(AgniExecutionVenue.ZeroAddress.selector);
        venue.setMarket(MARKET, address(0), FEE);
    }

    function test_SetMarket_StoresConfig() public {
        bytes32 m2 = keccak256("BTC-USD");
        venue.setMarket(m2, address(mkt), 500);
        (address t, uint24 f, bool configured) = venue.markets(m2);
        assertEq(t, address(mkt));
        assertEq(f, 500);
        assertTrue(configured);
    }

    /*//////////////////////////////////////////////////////////////
                              openPosition
    //////////////////////////////////////////////////////////////*/

    function test_Open_PullsBaseAndHoldsMarketToken() public {
        uint256 amountIn = 1_000e18;
        vm.prank(vault);
        uint256 received = venue.openPosition(MARKET, LONG, amountIn, 0, block.timestamp + 1);

        // 1:1 stub rate.
        assertEq(received, amountIn);
        assertEq(venue.heldBalance(MARKET), amountIn);
        // Base pulled from vault into the router.
        assertEq(base.balanceOf(vault), 100_000e18 - amountIn);
        // Venue holds the bought market token.
        assertEq(mkt.balanceOf(address(venue)), amountIn);
    }

    function test_Open_PassesMinOutAndDeadlineToRouter() public {
        uint256 amountIn = 500e18;
        uint256 minOut = 123e18;
        uint256 dl = block.timestamp + 999;
        vm.prank(vault);
        venue.openPosition(MARKET, LONG, amountIn, minOut, dl);

        (
            address tokenIn,
            address tokenOut,
            uint24 fee,
            address recipient,
            uint256 deadline,
            uint256 ai,
            uint256 amountOutMinimum,
            uint160 sqrtLimit
        ) = router.lastParams();
        assertEq(tokenIn, address(base));
        assertEq(tokenOut, address(mkt));
        assertEq(fee, FEE);
        assertEq(recipient, address(venue));
        assertEq(deadline, dl);
        assertEq(ai, amountIn);
        assertEq(amountOutMinimum, minOut);
        assertEq(sqrtLimit, 0);
    }

    function test_Open_RevertsNonLong() public {
        vm.prank(vault);
        vm.expectRevert(AgniExecutionVenue.NotSpotLong.selector);
        venue.openPosition(MARKET, FLAT, 1e18, 0, block.timestamp + 1);

        vm.prank(vault);
        vm.expectRevert(AgniExecutionVenue.NotSpotLong.selector);
        venue.openPosition(MARKET, SHORT, 1e18, 0, block.timestamp + 1);
    }

    function test_Open_RevertsZeroAmount() public {
        vm.prank(vault);
        vm.expectRevert(AgniExecutionVenue.ZeroAmount.selector);
        venue.openPosition(MARKET, LONG, 0, 0, block.timestamp + 1);
    }

    function test_Open_RevertsPastDeadline() public {
        vm.warp(1000);
        vm.prank(vault);
        vm.expectRevert(AgniExecutionVenue.PastDeadline.selector);
        venue.openPosition(MARKET, LONG, 1e18, 0, 999);
    }

    function test_Open_RevertsUnconfiguredMarket() public {
        bytes32 unknown = keccak256("UNKNOWN");
        vm.prank(vault);
        vm.expectRevert(
            abi.encodeWithSelector(AgniExecutionVenue.MarketNotConfigured.selector, unknown)
        );
        venue.openPosition(unknown, LONG, 1e18, 0, block.timestamp + 1);
    }

    function test_Open_RevertsSlippageViaRouter() public {
        // Stub reverts when amountOut < minOut.
        vm.prank(vault);
        vm.expectRevert(StubAgniRouter.SlippageExceeded.selector);
        venue.openPosition(MARKET, LONG, 100e18, 200e18, block.timestamp + 1);
    }

    /*//////////////////////////////////////////////////////////////
                              closePosition
    //////////////////////////////////////////////////////////////*/

    function _open(uint256 amountIn) internal returns (uint256) {
        vm.prank(vault);
        return venue.openPosition(MARKET, LONG, amountIn, 0, block.timestamp + 1);
    }

    function test_Close_SellsMarketTokenAndReturnsBase() public {
        _open(1_000e18);

        uint256 vaultBefore = base.balanceOf(vault);
        vm.prank(vault);
        uint256 received = venue.closePosition(MARKET, 400e18, 0, block.timestamp + 1);

        assertEq(received, 400e18); // 1:1
        assertEq(venue.heldBalance(MARKET), 600e18);
        // Base returned to the vault (the caller).
        assertEq(base.balanceOf(vault), vaultBefore + 400e18);
        assertEq(mkt.balanceOf(address(venue)), 600e18);
    }

    function test_Close_PassesMinOutAndDeadline() public {
        _open(1_000e18);
        uint256 dl = block.timestamp + 555;
        vm.prank(vault);
        venue.closePosition(MARKET, 300e18, 77e18, dl);

        (
            address tokenIn,
            address tokenOut,
            ,
            address recipient,
            uint256 deadline,
            uint256 ai,
            uint256 amountOutMinimum,
        ) = router.lastParams();
        assertEq(tokenIn, address(mkt));
        assertEq(tokenOut, address(base));
        assertEq(recipient, address(venue));
        assertEq(deadline, dl);
        assertEq(ai, 300e18);
        assertEq(amountOutMinimum, 77e18);
    }

    function test_Close_RevertsInsufficientHeld() public {
        _open(100e18);
        vm.prank(vault);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgniExecutionVenue.InsufficientHeld.selector, MARKET, 100e18, 200e18
            )
        );
        venue.closePosition(MARKET, 200e18, 0, block.timestamp + 1);
    }

    function test_Close_RevertsZeroAmount() public {
        vm.prank(vault);
        vm.expectRevert(AgniExecutionVenue.ZeroAmount.selector);
        venue.closePosition(MARKET, 0, 0, block.timestamp + 1);
    }

    function test_Close_RevertsPastDeadline() public {
        _open(100e18);
        vm.warp(2000);
        vm.prank(vault);
        vm.expectRevert(AgniExecutionVenue.PastDeadline.selector);
        venue.closePosition(MARKET, 50e18, 0, 1999);
    }

    /*//////////////////////////////////////////////////////////////
                             positionValue
    //////////////////////////////////////////////////////////////*/

    function test_PositionValue_OneToOneAtUnitPrice() public {
        _open(1_000e18);
        // Default pool price is 1.0 (sqrtPriceX96 == 2**96): value == held.
        assertEq(venue.positionValue(MARKET), 1_000e18);
    }

    function test_PositionValue_UsesPoolSpotPrice() public {
        uint256 held = 1_000e18;
        _open(held);
        // priceX96 = sqrtPriceX96^2 / 2**96; pick sqrt = 2 * 2**96 => price 4.0.
        uint160 sqrtPriceX96 = uint160(2 * Q96);
        pool.setSqrtPriceX96(sqrtPriceX96);

        uint256 expected = _expectedValue(held, sqrtPriceX96);
        // Sanity: at price 4, value is either 4x (mkt is token0) or 0.25x (base token0).
        assertTrue(expected == 4_000e18 || expected == 250e18, "ordering-aware spot value");
        assertEq(venue.positionValue(MARKET), expected);
    }

    function test_PositionValue_ZeroWhenNoHeld() public view {
        assertEq(venue.positionValue(MARKET), 0);
    }

    function test_PositionValue_FallbackOnSlot0Revert() public {
        _open(1_000e18);
        pool.setShouldRevert(true);
        // Falls back to raw held balance when slot0 reverts.
        assertEq(venue.positionValue(MARKET), 1_000e18);
    }

    function test_PositionValue_FallbackWhenNoPool() public {
        _open(1_000e18);
        factory.setPool(address(0));
        // Falls back to raw held balance when the factory has no pool.
        assertEq(venue.positionValue(MARKET), 1_000e18);
    }

    /*//////////////////////////////////////////////////////////////
                           REENTRANCY GUARD
    //////////////////////////////////////////////////////////////*/

    function test_ReentrancyGuard_BlocksReentrantOpen() public {
        // Arm the router to call back into the venue's openPosition mid-swap.
        // The stub bubbles the inner revert, so the whole outer call reverts with
        // the venue's Reentrancy error.
        bytes memory reenter = abi.encodeCall(
            AgniExecutionVenue.openPosition, (MARKET, LONG, 1e18, 0, type(uint256).max)
        );
        router.armReentrancy(address(venue), reenter);

        vm.prank(vault);
        vm.expectRevert(); // Reentrancy() bubbled through the router stub
        venue.openPosition(MARKET, LONG, 100e18, 0, block.timestamp + 1);

        // No state mutated: the guard reverted the entire transaction.
        assertEq(venue.heldBalance(MARKET), 0);
    }
}
