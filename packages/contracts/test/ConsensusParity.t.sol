// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {SibylConsensusLib} from "../src/libraries/SibylConsensusLib.sol";
import {ConsensusResult} from "../src/types/SibylTypes.sol";

/// @notice On-chain side of the on-chain<->off-chain parity gate. Reads the SAME frozen
///         golden vectors that the TypeScript parity test reads
///         (`test/fixtures/consensus-vectors.json`) and asserts the canonical Solidity
///         library reproduces each `expected` block exactly. Any divergence between the
///         Solidity and TS implementations fails CI.
contract ConsensusParityTest is Test {
    /// @dev Must equal the number of entries in `vectors`. A mismatch (too low) would silently
    ///      skip vectors, so we also assert the count below.
    uint256 internal constant VECTOR_COUNT = 16;

    string internal json;

    function setUp() public {
        json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/consensus-vectors.json"));
    }

    function test_Parity_VectorCountMatches() public view {
        // Probe one index past the asserted count: it must not exist.
        string memory path = string.concat("$.vectors[", vm.toString(VECTOR_COUNT), "].maxAgentWeightPpm");
        assertFalse(vm.keyExistsJson(json, path), "VECTOR_COUNT is stale; update it to match the fixture");
    }

    function test_Parity_GoldenVectorsMatchExpected() public view {
        for (uint256 i = 0; i < VECTOR_COUNT; i++) {
            string memory base = string.concat("$.vectors[", vm.toString(i), "]");

            uint256[] memory brierRaw = vm.parseJsonUintArray(json, string.concat(base, ".brierPpm"));
            bool[] memory isLong = vm.parseJsonBoolArray(json, string.concat(base, ".isLong"));
            uint256[] memory probRaw = vm.parseJsonUintArray(json, string.concat(base, ".probabilityPpm"));
            uint256 cap = vm.parseJsonUint(json, string.concat(base, ".maxAgentWeightPpm"));

            uint32[] memory brierPpm = new uint32[](brierRaw.length);
            for (uint256 j = 0; j < brierRaw.length; j++) {
                brierPpm[j] = uint32(brierRaw[j]);
            }
            uint32[] memory probabilityPpm = new uint32[](probRaw.length);
            for (uint256 j = 0; j < probRaw.length; j++) {
                probabilityPpm[j] = uint32(probRaw[j]);
            }

            ConsensusResult memory r = SibylConsensusLib.compute(brierPpm, isLong, probabilityPpm, uint32(cap));

            string memory tag = string.concat("vector ", vm.toString(i));
            assertEq(uint256(uint8(r.direction)), vm.parseJsonUint(json, string.concat(base, ".expected.direction")), string.concat(tag, ": direction"));
            assertEq(uint256(r.sizeBps), vm.parseJsonUint(json, string.concat(base, ".expected.sizeBps")), string.concat(tag, ": sizeBps"));
            assertEq(uint256(r.confidencePpm), vm.parseJsonUint(json, string.concat(base, ".expected.confidencePpm")), string.concat(tag, ": confidencePpm"));
            assertEq(uint256(r.contributorCount), vm.parseJsonUint(json, string.concat(base, ".expected.contributorCount")), string.concat(tag, ": contributorCount"));
        }
    }
}
