// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/SibylLedger.sol";

contract SibylLedgerTest is Test {
    SibylLedger internal ledger;

    function setUp() public {
        ledger = new SibylLedger();
    }

    function testOwnerSet() public view {
        assertEq(ledger.owner(), address(this));
    }

    function testRegisterAgent() public {
        bytes32 agentId = keccak256("momentum_v1");
        ledger.registerAgent(agentId);
        (bytes32 stored, uint32 brier, bool exists) = ledger.scores(agentId);
        assertEq(stored, agentId);
        assertEq(brier, 0);
        assertTrue(exists);
    }
}
