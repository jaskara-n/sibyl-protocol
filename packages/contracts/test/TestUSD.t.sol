// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TestUSD} from "../src/tokens/TestUSD.sol";

contract TestUSDTest is Test {
    TestUSD internal usd;
    address internal owner = address(this);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        usd = new TestUSD();
    }

    function test_Metadata() public view {
        assertEq(usd.name(), "Sibyl Test USD");
        assertEq(usd.symbol(), "sUSD");
        assertEq(usd.decimals(), 18);
        assertEq(usd.owner(), owner);
    }

    function test_OwnerCanMint() public {
        usd.mint(alice, 1_000e18);
        assertEq(usd.balanceOf(alice), 1_000e18);
        assertEq(usd.totalSupply(), 1_000e18);
    }

    function test_NonOwnerCannotMint() public {
        vm.prank(alice);
        vm.expectRevert();
        usd.mint(alice, 1e18);
    }

    function test_Transfer() public {
        usd.mint(alice, 100e18);
        vm.prank(alice);
        usd.transfer(bob, 40e18);
        assertEq(usd.balanceOf(alice), 60e18);
        assertEq(usd.balanceOf(bob), 40e18);
    }

    function test_TransferFromWithAllowance() public {
        usd.mint(alice, 100e18);
        vm.prank(alice);
        usd.approve(bob, 50e18);

        vm.prank(bob);
        usd.transferFrom(alice, bob, 30e18);
        assertEq(usd.balanceOf(bob), 30e18);
        assertEq(usd.allowance(alice, bob), 20e18);
    }

    function test_OwnershipTwoStep() public {
        usd.transferOwnership(alice);
        assertEq(usd.owner(), owner);
        assertEq(usd.pendingOwner(), alice);

        vm.prank(alice);
        usd.acceptOwnership();
        assertEq(usd.owner(), alice);

        // New owner can mint, old owner cannot.
        vm.prank(alice);
        usd.mint(bob, 5e18);
        assertEq(usd.balanceOf(bob), 5e18);

        vm.expectRevert();
        usd.mint(bob, 1e18);
    }
}
