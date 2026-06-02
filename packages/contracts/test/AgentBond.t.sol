// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {AgentBond} from "../src/AgentBond.sol";
import {IAgentBond} from "../src/interfaces/IAgentBond.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {Ownable2Step} from "../src/access/Ownable2Step.sol";
import {AgentScore} from "../src/types/SibylTypes.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice ERC20 that re-enters AgentBond.withdraw on transfer, to exercise the guard.
contract ReentrantToken is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    AgentBond public target;
    bytes32 public attackAgent;
    bool public attacking;

    function arm(AgentBond t, bytes32 agentId) external {
        target = t;
        attackAgent = agentId;
        attacking = true;
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
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        // Re-enter on the way out of a withdraw.
        if (attacking) {
            attacking = false;
            target.withdraw(attackAgent, amount);
        }
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract AgentBondTest is Test {
    AgentBond internal bond;
    MockERC20 internal token;

    address internal constant OPERATOR = address(0x09E);
    address internal constant SLASH_SINK = address(0x51A5);
    address internal constant AGENT_OWNER = address(0xA9E47);
    address internal constant STRANGER = address(0xBEEF);

    bytes32 internal constant AGENT = keccak256("agent_1");
    bytes32 internal constant DATASET = keccak256("dataset_1");
    uint32 internal constant SCORING_VERSION = 3;

    function setUp() public {
        token = new MockERC20();
        bond = new AgentBond(IERC20(address(token)), OPERATOR, SLASH_SINK);

        token.mint(AGENT_OWNER, 1_000 ether);
        vm.prank(AGENT_OWNER);
        token.approve(address(bond), type(uint256).max);
    }

    function _revealed() internal pure returns (AgentScore memory) {
        return AgentScore({
            agentId: AGENT,
            brierPpm: 120_000,
            updatedEpoch: 7,
            active: true,
            exists: true,
            marketId: bytes32(0)
        });
    }

    /*//////////////////////////////////////////////////////////////
                            STAKE / WITHDRAW
    //////////////////////////////////////////////////////////////*/

    function test_stakeWithdrawRoundTrip() public {
        vm.prank(AGENT_OWNER);
        bond.stake(AGENT, 100 ether);

        assertEq(bond.stakeOf(AGENT), 100 ether);
        assertTrue(bond.bonded(AGENT));
        assertEq(token.balanceOf(address(bond)), 100 ether);

        // Partial withdraw keeps it bonded.
        vm.prank(AGENT_OWNER);
        bond.withdraw(AGENT, 40 ether);
        assertEq(bond.stakeOf(AGENT), 60 ether);
        assertTrue(bond.bonded(AGENT));

        // Full withdraw clears the bond.
        vm.prank(AGENT_OWNER);
        bond.withdraw(AGENT, 60 ether);
        assertEq(bond.stakeOf(AGENT), 0);
        assertFalse(bond.bonded(AGENT));
        assertEq(token.balanceOf(AGENT_OWNER), 1_000 ether);
        assertEq(token.balanceOf(address(bond)), 0);
    }

    function test_stakeTopUp() public {
        vm.startPrank(AGENT_OWNER);
        bond.stake(AGENT, 30 ether);
        bond.stake(AGENT, 20 ether);
        vm.stopPrank();
        assertEq(bond.stakeOf(AGENT), 50 ether);
    }

    function test_withdraw_revertsWhenNothing() public {
        vm.prank(AGENT_OWNER);
        vm.expectRevert(IAgentBond.NothingToWithdraw.selector);
        bond.withdraw(AGENT, 1 ether);
    }

    function test_withdraw_revertsWhenInsufficient() public {
        vm.prank(AGENT_OWNER);
        bond.stake(AGENT, 10 ether);

        vm.prank(AGENT_OWNER);
        vm.expectRevert(IAgentBond.NothingToWithdraw.selector);
        bond.withdraw(AGENT, 11 ether);
    }

    /*//////////////////////////////////////////////////////////////
                                SLASH
    //////////////////////////////////////////////////////////////*/

    function test_slash_succeedsOnMismatch() public {
        vm.prank(AGENT_OWNER);
        bond.stake(AGENT, 100 ether);

        AgentScore memory revealed = _revealed();
        bytes32 committed = keccak256("some_other_commitment");

        vm.prank(OPERATOR);
        bond.slash(AGENT, DATASET, SCORING_VERSION, committed, revealed);

        assertEq(bond.stakeOf(AGENT), 0);
        assertFalse(bond.bonded(AGENT));
        assertEq(token.balanceOf(SLASH_SINK), 100 ether);
    }

    function test_slash_revertsNoFraudWhenRevealMatches() public {
        vm.prank(AGENT_OWNER);
        bond.stake(AGENT, 100 ether);

        AgentScore memory revealed = _revealed();
        // Honest commitment: hash matches the reveal exactly as the contract computes it.
        bytes32 committed = keccak256(abi.encode(DATASET, SCORING_VERSION, revealed));

        vm.prank(OPERATOR);
        vm.expectRevert(IAgentBond.NoFraud.selector);
        bond.slash(AGENT, DATASET, SCORING_VERSION, committed, revealed);

        // Stake untouched.
        assertEq(bond.stakeOf(AGENT), 100 ether);
        assertTrue(bond.bonded(AGENT));
    }

    function test_slash_revertsWhenNotBonded() public {
        AgentScore memory revealed = _revealed();
        bytes32 committed = keccak256("x");
        vm.prank(OPERATOR);
        vm.expectRevert(IAgentBond.NotBonded.selector);
        bond.slash(AGENT, DATASET, SCORING_VERSION, committed, revealed);
    }

    function test_slash_ownerCanSlash() public {
        vm.prank(AGENT_OWNER);
        bond.stake(AGENT, 50 ether);

        AgentScore memory revealed = _revealed();
        bytes32 committed = keccak256("mismatch");

        // owner is the test contract (deployer).
        bond.slash(AGENT, DATASET, SCORING_VERSION, committed, revealed);
        assertEq(token.balanceOf(SLASH_SINK), 50 ether);
    }

    function test_slash_strangerCannotSlash() public {
        vm.prank(AGENT_OWNER);
        bond.stake(AGENT, 50 ether);

        AgentScore memory revealed = _revealed();
        bytes32 committed = keccak256("mismatch");

        vm.prank(STRANGER);
        vm.expectRevert(AgentBond.NotAuthorized.selector);
        bond.slash(AGENT, DATASET, SCORING_VERSION, committed, revealed);
    }

    /*//////////////////////////////////////////////////////////////
                            REENTRANCY GUARD
    //////////////////////////////////////////////////////////////*/

    function test_reentrancyGuardOnWithdraw() public {
        ReentrantToken evil = new ReentrantToken();
        AgentBond rbond = new AgentBond(IERC20(address(evil)), OPERATOR, SLASH_SINK);

        evil.mint(AGENT_OWNER, 100 ether);
        vm.prank(AGENT_OWNER);
        evil.approve(address(rbond), type(uint256).max);

        vm.prank(AGENT_OWNER);
        rbond.stake(AGENT, 100 ether);

        evil.arm(rbond, AGENT);

        // The re-entrant withdraw inside transfer must bubble up the guard revert.
        vm.prank(AGENT_OWNER);
        vm.expectRevert();
        rbond.withdraw(AGENT, 50 ether);
    }
}
