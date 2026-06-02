// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {RewardDistributor} from "../src/RewardDistributor.sol";
import {IRewardDistributor} from "../src/interfaces/IRewardDistributor.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {Ownable2Step} from "../src/access/Ownable2Step.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract RewardDistributorTest is Test {
    RewardDistributor internal dist;
    MockERC20 internal token;

    address internal constant OPERATOR = address(0x09E);
    address internal constant FUNDER = address(0xF000);
    address internal constant CLAIMER_A = address(0xA1);
    address internal constant CLAIMER_B = address(0xB2);
    address internal constant CLAIMER_C = address(0xC3);
    address internal constant STRANGER = address(0xBEEF);

    bytes32 internal constant AGENT_A = keccak256("agent_a");
    bytes32 internal constant AGENT_B = keccak256("agent_b");
    bytes32 internal constant AGENT_C = keccak256("agent_c");

    uint64 internal constant EPOCH = 7;

    function setUp() public {
        token = new MockERC20();
        dist = new RewardDistributor(IERC20(address(token)), OPERATOR);

        token.mint(FUNDER, 10_000 ether);
        vm.prank(FUNDER);
        token.approve(address(dist), type(uint256).max);
    }

    function _fund(uint256 amount) internal {
        vm.prank(FUNDER);
        dist.fund(EPOCH, amount);
    }

    /*//////////////////////////////////////////////////////////////
                                FUNDING
    //////////////////////////////////////////////////////////////*/

    function test_fundIncreasesPool() public {
        _fund(100 ether);
        assertEq(dist.epochPool(EPOCH), 100 ether);
        assertEq(token.balanceOf(address(dist)), 100 ether);

        _fund(50 ether);
        assertEq(dist.epochPool(EPOCH), 150 ether);
        assertEq(token.balanceOf(address(dist)), 150 ether);
    }

    /*//////////////////////////////////////////////////////////////
                              ALLOCATIONS
    //////////////////////////////////////////////////////////////*/

    function test_setAllocations_revertsOnLengthMismatch() public {
        bytes32[] memory ids = new bytes32[](2);
        ids[0] = AGENT_A;
        ids[1] = AGENT_B;
        uint256[] memory weights = new uint256[](1);
        weights[0] = 1;

        vm.expectRevert(IRewardDistributor.LengthMismatch.selector);
        dist.setAllocations(EPOCH, ids, weights);
    }

    function test_setAllocations_onlyOwner() public {
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = AGENT_A;
        uint256[] memory weights = new uint256[](1);
        weights[0] = 1;

        vm.prank(STRANGER);
        vm.expectRevert(Ownable2Step.NotOwner.selector);
        dist.setAllocations(EPOCH, ids, weights);
    }

    /*//////////////////////////////////////////////////////////////
                                 CLAIM
    //////////////////////////////////////////////////////////////*/

    function _setThreeWayAllocation() internal {
        bytes32[] memory ids = new bytes32[](3);
        ids[0] = AGENT_A;
        ids[1] = AGENT_B;
        ids[2] = AGENT_C;
        uint256[] memory weights = new uint256[](3);
        weights[0] = 1; // 1/6
        weights[1] = 2; // 2/6
        weights[2] = 3; // 3/6
        dist.setAllocations(EPOCH, ids, weights);
    }

    function test_claim_paysProRata() public {
        _fund(600 ether);
        _setThreeWayAllocation();

        vm.prank(CLAIMER_A);
        dist.claim(AGENT_A, EPOCH);
        vm.prank(CLAIMER_B);
        dist.claim(AGENT_B, EPOCH);
        vm.prank(CLAIMER_C);
        dist.claim(AGENT_C, EPOCH);

        // 600 * 1/6, 2/6, 3/6.
        assertEq(token.balanceOf(CLAIMER_A), 100 ether);
        assertEq(token.balanceOf(CLAIMER_B), 200 ether);
        assertEq(token.balanceOf(CLAIMER_C), 300 ether);
    }

    function test_claim_revertsAlreadyClaimed() public {
        _fund(600 ether);
        _setThreeWayAllocation();

        vm.prank(CLAIMER_A);
        dist.claim(AGENT_A, EPOCH);

        vm.prank(CLAIMER_A);
        vm.expectRevert(IRewardDistributor.AlreadyClaimed.selector);
        dist.claim(AGENT_A, EPOCH);
    }

    function test_claim_revertsNothingToClaim() public {
        _fund(600 ether);
        _setThreeWayAllocation();

        bytes32 unknown = keccak256("agent_x");
        vm.prank(STRANGER);
        vm.expectRevert(IRewardDistributor.NothingToClaim.selector);
        dist.claim(unknown, EPOCH);
    }

    function test_claim_revertsEpochNotFunded() public {
        _setThreeWayAllocation();

        vm.prank(CLAIMER_A);
        vm.expectRevert(IRewardDistributor.EpochNotFunded.selector);
        dist.claim(AGENT_A, EPOCH);
    }

    /// @notice The sum of all pro-rata claims never exceeds the funded pool.
    function test_sumOfClaims_lessThanOrEqualPool() public {
        // Use a pool that does not divide evenly so rounding-down is exercised.
        uint256 pool = 1000 ether + 1;
        _fund(pool);
        _setThreeWayAllocation();

        vm.prank(CLAIMER_A);
        dist.claim(AGENT_A, EPOCH);
        vm.prank(CLAIMER_B);
        dist.claim(AGENT_B, EPOCH);
        vm.prank(CLAIMER_C);
        dist.claim(AGENT_C, EPOCH);

        uint256 paid = token.balanceOf(CLAIMER_A) + token.balanceOf(CLAIMER_B) + token.balanceOf(CLAIMER_C);
        assertLe(paid, pool);
        // Dust (rounding) remains in the distributor.
        assertEq(token.balanceOf(address(dist)), pool - paid);
    }
}
