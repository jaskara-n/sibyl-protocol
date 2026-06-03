// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MetaVenue} from "../../src/venues/MetaVenue.sol";
import {IExecutionVenue} from "../../src/interfaces/IExecutionVenue.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";
import {TestUSD} from "../../src/tokens/TestUSD.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {Ownable2Step} from "../../src/access/Ownable2Step.sol";

contract MetaVenueTest is Test {
    MetaVenue internal meta;
    TestUSD internal usdA;
    MockERC20 internal usdB;
    StubSubVenue internal venueA;
    StubSubVenue internal venueB;

    address internal owner = address(this);
    address internal vault = makeAddr("vault");

    bytes32 internal constant MA = keccak256("market-A");
    bytes32 internal constant MB = keccak256("market-B");
    bytes32 internal constant UNROUTED = keccak256("unrouted");

    uint8 internal constant LONG = 1;

    function setUp() public {
        usdA = new TestUSD();
        usdB = new MockERC20();
        venueA = new StubSubVenue();
        venueB = new StubSubVenue();

        meta = new MetaVenue(owner);
        meta.setMarketVenue(MA, IExecutionVenue(address(venueA)), IERC20(address(usdA)));
        meta.setMarketVenue(MB, IExecutionVenue(address(venueB)), IERC20(address(usdB)));

        // Tell each stub which collateral token it settles in.
        venueA.setCollateral(IERC20(address(usdA)));
        venueB.setCollateral(IERC20(address(usdB)));

        // Fund vault and pre-fund sub-venues with collateral for closes.
        usdA.mint(vault, 1_000_000e18);
        usdB.mint(vault, 1_000_000e18);
        usdA.mint(address(venueA), 1_000_000e18);
        usdB.mint(address(venueB), 1_000_000e18);

        vm.startPrank(vault);
        usdA.approve(address(meta), type(uint256).max);
        usdB.approve(address(meta), type(uint256).max);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                                  ADMIN
    //////////////////////////////////////////////////////////////*/

    function test_SetMarketVenue_OwnerOnly() public {
        vm.prank(vault);
        vm.expectRevert(Ownable2Step.NotOwner.selector);
        meta.setMarketVenue(MA, IExecutionVenue(address(venueA)), IERC20(address(usdA)));
    }

    function test_SetMarketVenue_RevertsZeroAddress() public {
        vm.expectRevert(MetaVenue.ZeroAddress.selector);
        meta.setMarketVenue(MA, IExecutionVenue(address(0)), IERC20(address(usdA)));
        vm.expectRevert(MetaVenue.ZeroAddress.selector);
        meta.setMarketVenue(MA, IExecutionVenue(address(venueA)), IERC20(address(0)));
    }

    /*//////////////////////////////////////////////////////////////
                                ROUTING
    //////////////////////////////////////////////////////////////*/

    function test_Open_RoutesToCorrectVenueAndForwardsFunds() public {
        uint256 amountIn = 1_000e18;
        venueA.setReceived(777e18);

        vm.prank(vault);
        uint256 received = meta.openPosition(MA, LONG, amountIn, 5e18, block.timestamp + 1);

        assertEq(received, 777e18);
        // venueA observed the forwarded call.
        assertEq(venueA.lastMarketId(), MA);
        assertEq(venueA.lastDirection(), LONG);
        assertEq(venueA.lastAmountIn(), amountIn);
        assertEq(venueA.lastMinOut(), 5e18);
        // Funds: vault -> meta -> venueA (pulled by the sub-venue).
        assertEq(usdA.balanceOf(vault), 1_000_000e18 - amountIn);
        assertEq(usdA.balanceOf(address(venueA)), 1_000_000e18 + amountIn);
        // venueB untouched.
        assertEq(venueB.lastAmountIn(), 0);
        // Meta holds no residual collateral.
        assertEq(usdA.balanceOf(address(meta)), 0);
    }

    function test_Open_RoutesSecondMarketToSecondVenue() public {
        uint256 amountIn = 250e18;
        vm.prank(vault);
        meta.openPosition(MB, LONG, amountIn, 0, block.timestamp + 1);

        assertEq(venueB.lastMarketId(), MB);
        assertEq(venueB.lastAmountIn(), amountIn);
        assertEq(venueA.lastAmountIn(), 0);
        assertEq(usdB.balanceOf(address(venueB)), 1_000_000e18 + amountIn);
    }

    function test_Close_ForwardsCollateralBackToVault() public {
        uint256 payout = 640e18;
        venueA.setClosePayout(payout);

        uint256 vaultBefore = usdA.balanceOf(vault);
        vm.prank(vault);
        uint256 received = meta.closePosition(MA, 100e18, 0, block.timestamp + 1);

        assertEq(received, payout);
        // Sub-venue paid the meta, meta forwarded to vault.
        assertEq(usdA.balanceOf(vault), vaultBefore + payout);
        assertEq(usdA.balanceOf(address(meta)), 0);
        assertEq(venueA.lastCloseAmountIn(), 100e18);
    }

    function test_PositionValue_ForwardsToSubVenue() public {
        venueA.setPositionValue(MA, 4242e18);
        assertEq(meta.positionValue(MA), 4242e18);
    }

    function test_HeldBalance_ForwardsToSubVenue() public {
        venueA.setHeld(MA, 88e18);
        assertEq(meta.heldBalance(MA), 88e18);
    }

    function test_PositionToken_IsZero() public view {
        assertEq(meta.positionToken(), address(0));
    }

    /*//////////////////////////////////////////////////////////////
                            UNROUTED REVERTS
    //////////////////////////////////////////////////////////////*/

    function test_Open_RevertsUnrouted() public {
        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(MetaVenue.UnroutedMarket.selector, UNROUTED));
        meta.openPosition(UNROUTED, LONG, 1e18, 0, block.timestamp + 1);
    }

    function test_Close_RevertsUnrouted() public {
        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(MetaVenue.UnroutedMarket.selector, UNROUTED));
        meta.closePosition(UNROUTED, 1e18, 0, block.timestamp + 1);
    }

    function test_PositionValue_RevertsUnrouted() public {
        vm.expectRevert(abi.encodeWithSelector(MetaVenue.UnroutedMarket.selector, UNROUTED));
        meta.positionValue(UNROUTED);
    }

    function test_HeldBalance_RevertsUnrouted() public {
        vm.expectRevert(abi.encodeWithSelector(MetaVenue.UnroutedMarket.selector, UNROUTED));
        meta.heldBalance(UNROUTED);
    }
}

/// @dev TEST-ONLY sub-venue implementing {IExecutionVenue}. Records forwarded
///      calls, pulls collateral on open (like a real sub-venue), and pays a
///      configurable collateral payout to its caller (the MetaVenue) on close.
contract StubSubVenue is IExecutionVenue {
    bytes32 public lastMarketId;
    uint8 public lastDirection;
    uint256 public lastAmountIn;
    uint256 public lastMinOut;
    uint256 public lastCloseAmountIn;

    uint256 internal received;
    uint256 internal closePayout;

    mapping(bytes32 => uint256) internal value;
    mapping(bytes32 => uint256) internal held;

    // Track collateral pulled so the test can find it via the token balance.
    IERC20 internal lastCollateral;

    function setReceived(uint256 v) external {
        received = v;
    }

    function setClosePayout(uint256 v) external {
        closePayout = v;
    }

    function setPositionValue(bytes32 marketId, uint256 v) external {
        value[marketId] = v;
    }

    function setHeld(bytes32 marketId, uint256 v) external {
        held[marketId] = v;
    }

    function openPosition(bytes32 marketId, uint8 direction, uint256 amountIn, uint256 minOut, uint256)
        external
        returns (uint256)
    {
        lastMarketId = marketId;
        lastDirection = direction;
        lastAmountIn = amountIn;
        lastMinOut = minOut;
        // Pull collateral from the caller (the MetaVenue) like a real sub-venue.
        // The MetaVenue approved us for `amountIn` of the routed collateral.
        require(
            IERC20(address(lastCollateral)).transferFrom(msg.sender, address(this), amountIn),
            "PULL"
        );
        return received == 0 ? amountIn : received;
    }

    function closePosition(bytes32 marketId, uint256 amountIn, uint256, uint256)
        external
        returns (uint256)
    {
        lastMarketId = marketId;
        lastCloseAmountIn = amountIn;
        uint256 pay = closePayout;
        if (pay > 0) {
            // Pay the caller (the MetaVenue) collateral. The token is set on the
            // first open; if unset, fall back to the stored collateral.
            require(IERC20(address(lastCollateral)).transfer(msg.sender, pay), "PAY");
        }
        return pay;
    }

    function positionValue(bytes32 marketId) external view returns (uint256) {
        return value[marketId];
    }

    function heldBalance(bytes32 marketId) external view returns (uint256) {
        return held[marketId];
    }

    function positionToken() external pure returns (address) {
        return address(0);
    }

    function setCollateral(IERC20 c) external {
        lastCollateral = c;
    }
}
