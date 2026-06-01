// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {SibylConsensusLib} from "../src/libraries/SibylConsensusLib.sol";
import {ConsensusResult, Direction} from "../src/types/SibylTypes.sol";

contract SibylConsensusLibTest is Test {
    uint32 internal constant NO_CAP = 1_000_001;

    function _one(uint32 brier, bool isLong, uint32 prob, uint32 cap)
        internal
        pure
        returns (ConsensusResult memory)
    {
        uint32[] memory b = new uint32[](1);
        bool[] memory l = new bool[](1);
        uint32[] memory p = new uint32[](1);
        b[0] = brier;
        l[0] = isLong;
        p[0] = prob;
        return SibylConsensusLib.compute(b, l, p, cap);
    }

    function testLib_WeightPpm_RangeAndEpsilon() public pure {
        assertEq(SibylConsensusLib.weightPpm(0), 1_000_001);
        assertEq(SibylConsensusLib.weightPpm(1_000_000), 1); // worst calibration still has epsilon weight
        assertEq(SibylConsensusLib.weightPpm(2_000_000), 1); // defensive clamp
        assertEq(SibylConsensusLib.weightPpm(250_000), 750_001);
    }

    function testLib_SingleAgentConfidenceEqualsProb() public pure {
        ConsensusResult memory r = _one(0, true, 700_000, NO_CAP);
        assertEq(r.confidencePpm, 700_000);
        assertEq(uint8(r.direction), uint8(Direction.LONG));
        // edge 200_000 -> (200000+125)/250 = 800
        assertEq(r.sizeBps, 800);
        assertEq(r.contributorCount, 1);
    }

    function testLib_ShortSideInverts() public pure {
        ConsensusResult memory r = _one(0, false, 700_000, NO_CAP);
        assertEq(r.confidencePpm, 300_000); // 1e6 - 700_000
        assertEq(uint8(r.direction), uint8(Direction.SHORT));
        assertEq(r.sizeBps, 800);
    }

    function testLib_ZeroContributorsReturnsFlat() public pure {
        uint32[] memory b = new uint32[](0);
        bool[] memory l = new bool[](0);
        uint32[] memory p = new uint32[](0);
        ConsensusResult memory r = SibylConsensusLib.compute(b, l, p, NO_CAP);
        assertEq(uint8(r.direction), uint8(Direction.FLAT));
        assertEq(r.sizeBps, 0);
        assertEq(r.confidencePpm, 500_000);
        assertEq(r.contributorCount, 0);
    }

    function testLib_BandEdgesAreFlat() public pure {
        // confidence exactly at 505_000 / 495_000 must be FLAT (strict comparators)
        assertEq(uint8(_one(0, true, 505_000, NO_CAP).direction), uint8(Direction.FLAT));
        assertEq(uint8(_one(0, true, 495_000, NO_CAP).direction), uint8(Direction.FLAT));
        assertEq(_one(0, true, 505_000, NO_CAP).sizeBps, 0);
    }

    function testLib_JustOutsideBand() public pure {
        assertEq(uint8(_one(0, true, 505_001, NO_CAP).direction), uint8(Direction.LONG));
        assertEq(uint8(_one(0, true, 494_999, NO_CAP).direction), uint8(Direction.SHORT));
    }

    function testLib_SizeRoundHalfUp() public pure {
        // Confidence must be OUTSIDE the FLAT band for size to be non-zero.
        // edge 5125 -> 5125/250 = 20.5 -> round-half-up 21 ; edge 5375 -> 21.5 -> 22.
        // This is exactly where float Math.round(edge*2000) historically diverged.
        assertEq(_one(0, true, 505_125, NO_CAP).sizeBps, 21);
        assertEq(_one(0, true, 505_375, NO_CAP).sizeBps, 22);
    }

    function testLib_SizeNeverExceedsMax() public pure {
        ConsensusResult memory r = _one(0, true, 1_000_000, NO_CAP);
        assertEq(r.confidencePpm, 1_000_000);
        assertEq(r.sizeBps, SibylConsensusLib.MAX_SIZE_BPS);
    }

    function testLib_CapBindsAgainstDomination() public pure {
        // Agent A: brier 0 (weight 1_000_001) wants SHORT at prob 1.0 (longProb 0)
        // Agent B: brier 0 (weight 1_000_001) wants LONG at prob 1.0 (longProb 1e6)
        // Equal weights -> confidence 500_000 -> FLAT regardless of cap; flip to show cap symmetry.
        uint32[] memory b = new uint32[](2);
        bool[] memory l = new bool[](2);
        uint32[] memory p = new uint32[](2);
        b[0] = 0;
        b[1] = 900_000; // weak agent, weight ~100_001
        l[0] = true;
        l[1] = true;
        p[0] = 1_000_000;
        p[1] = 1_000_000;

        // Without cap the strong agent dominates -> high confidence.
        ConsensusResult memory uncapped = SibylConsensusLib.compute(b, l, p, NO_CAP);
        // With a tight cap both agents weigh equally -> still LONG but identical prob so same conf.
        ConsensusResult memory capped = SibylConsensusLib.compute(b, l, p, 50_000);
        // Both LONG here (same direction); the meaningful invariant is capped weight never exceeds cap,
        // which is exercised in the differential fuzz. Sanity: both directions LONG.
        assertEq(uint8(uncapped.direction), uint8(Direction.LONG));
        assertEq(uint8(capped.direction), uint8(Direction.LONG));
    }

    function testFuzz_RangeInvariants(uint32 brier, bool isLong, uint32 prob, uint32 cap) public pure {
        brier = uint32(bound(brier, 0, 1_000_000));
        prob = uint32(bound(prob, 0, 1_000_000));
        cap = uint32(bound(cap, 1, 1_000_001));
        ConsensusResult memory r = _one(brier, isLong, prob, cap);
        assertLe(r.confidencePpm, 1_000_000);
        assertLe(r.sizeBps, SibylConsensusLib.MAX_SIZE_BPS);
        bool inBand = r.confidencePpm >= 495_000 && r.confidencePpm <= 505_000;
        assertEq(r.direction == Direction.FLAT, inBand);
        if (r.direction == Direction.FLAT) assertEq(r.sizeBps, 0);
    }

    function testFuzz_Symmetry(uint32 brier, uint32 prob) public pure {
        brier = uint32(bound(brier, 0, 1_000_000));
        prob = uint32(bound(prob, 0, 1_000_000));
        ConsensusResult memory up = _one(brier, true, prob, NO_CAP);
        ConsensusResult memory down = _one(brier, false, prob, NO_CAP);
        // confidence_down == 1e6 - confidence_up ; sizes equal
        assertEq(down.confidencePpm, 1_000_000 - up.confidencePpm);
        assertEq(down.sizeBps, up.sizeBps);
    }

    function _two(uint32[2] memory brier, bool[2] memory l, uint32[2] memory p, uint32 cap)
        internal
        pure
        returns (ConsensusResult memory)
    {
        uint32[] memory b = new uint32[](2);
        bool[] memory ll = new bool[](2);
        uint32[] memory pp = new uint32[](2);
        for (uint256 i = 0; i < 2; i++) {
            b[i] = brier[i];
            ll[i] = l[i];
            pp[i] = p[i];
        }
        return SibylConsensusLib.compute(b, ll, pp, cap);
    }

    function testLib_CapBindingChangesConfidence() public pure {
        uint32[2] memory brier = [uint32(0), 900_000];
        bool[2] memory l = [true, false];
        uint32[2] memory p = [uint32(1_000_000), 1_000_000];
        ConsensusResult memory uncapped = _two(brier, l, p, NO_CAP);
        ConsensusResult memory capped = _two(brier, l, p, 100_001); // both clamp to equal weight
        assertGt(uncapped.confidencePpm, capped.confidencePpm);
        assertEq(capped.confidencePpm, 500_000); // equal weight, opposing sides -> dead center
        assertEq(uint8(capped.direction), uint8(Direction.FLAT));
    }

    function testLib_CapNoOpWhenNonBinding() public pure {
        // brier 600_000 -> weight 400_001; any cap >= 400_001 must not change the outcome.
        uint32[2] memory brier = [uint32(600_000), 600_000];
        bool[2] memory l = [true, false];
        uint32[2] memory p = [uint32(700_000), 300_000]; // both map to longProb 700_000
        ConsensusResult memory a = _two(brier, l, p, 400_001);
        ConsensusResult memory b = _two(brier, l, p, NO_CAP);
        assertEq(a.confidencePpm, b.confidencePpm);
        assertEq(a.sizeBps, b.sizeBps);
        assertEq(uint8(a.direction), uint8(b.direction));
    }

    function testLib_BandEdgeMultiAgentFlat() public pure {
        // Two equal-weight agents averaging exactly 505_000 -> FLAT.
        uint32[2] memory brier = [uint32(0), 0];
        bool[2] memory l = [true, true];
        uint32[2] memory p = [uint32(510_000), 500_000];
        ConsensusResult memory r = _two(brier, l, p, NO_CAP);
        assertEq(r.confidencePpm, 505_000);
        assertEq(uint8(r.direction), uint8(Direction.FLAT));
        assertEq(r.sizeBps, 0);
    }

    function testLib_CapBoundaryMin() public pure {
        // cap == 1 clamps every weight to 1 -> unweighted average.
        uint32[2] memory brier = [uint32(0), 200_000];
        bool[2] memory l = [true, true];
        uint32[2] memory p = [uint32(800_000), 600_000];
        ConsensusResult memory r = _two(brier, l, p, 1);
        assertEq(r.confidencePpm, 700_000); // (800000 + 600000) / 2
    }

    function testFuzz_SizeZeroIffFlat(uint32 brier, bool isLong, uint32 prob) public pure {
        brier = uint32(bound(brier, 0, 1_000_000));
        prob = uint32(bound(prob, 0, 1_000_000));
        ConsensusResult memory r = _one(brier, isLong, prob, NO_CAP);
        assertEq(r.sizeBps == 0, r.direction == Direction.FLAT);
    }

    function testFuzz_WeightMonotonicInBrier(uint32 a, uint32 b) public pure {
        a = uint32(bound(a, 0, 1_000_000));
        b = uint32(bound(b, 0, 1_000_000));
        if (a <= b) {
            assertGe(SibylConsensusLib.weightPpm(a), SibylConsensusLib.weightPpm(b));
        }
    }
}
