// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ConsensusResult, Direction} from "../types/SibylTypes.sol";

/// @title SibylConsensusLib
/// @notice The single canonical, stateless implementation of Sibyl's reputation-weighted
///         consensus. Both the view path (`computeConsensus`) and the event path
///         (`emitConsensus`) in the core contract delegate to {compute}.
/// @dev ALL arithmetic is integer in the parts-per-million (ppm) domain (`1_000_000 == 1.0`).
///
///      ===== OFF-CHAIN PARITY =====
///      This file is the reference implementation. `packages/shared/src/index.ts`
///      (`computeConsensusPpm`) MUST mirror it line-for-line in BigInt, and the frozen
///      golden vectors in `test/fixtures/consensus-vectors.json` are asserted by BOTH
///      `test/ConsensusParity.t.sol` and the TypeScript parity test.
///
///      Rules pinned here are authoritative:
///        - weight: `(1e6 - min(brier,1e6)) + 1`  (range [1, 1_000_001]; +1 ppm epsilon keeps
///          a worst-calibrated agent non-vanishing).
///        - per-agent cap: `w = min(w, maxAgentWeightPpm)` applied per signal (NOT share
///          renormalization, which is path-dependent and float-hostile).
///        - confidence: `weightedLong * 1e6 / totalWeight`, floor (truncating) division.
///        - direction band (strict comparators; edges 495_000 / 505_000 classify as FLAT):
///          `> 505_000 => LONG`, `< 495_000 => SHORT`, else `FLAT`.
///        - size: round-half-up of `edgePpm / 250`, written `(edgePpm + 125) / 250`, capped at
///          2000 bps, forced to 0 when FLAT.
///        - degenerate (empty / zero total weight): return `{FLAT, 0, 500_000, 0}` (never revert).
library SibylConsensusLib {
    uint256 internal constant ONE_PPM = 1_000_000;
    uint256 internal constant HALF_PPM = 500_000;
    uint256 internal constant FLAT_LOWER_PPM = 495_000;
    uint256 internal constant FLAT_UPPER_PPM = 505_000;
    uint16 internal constant MAX_SIZE_BPS = 2_000;
    uint256 internal constant SIZE_DIVISOR = 250;

    /// @notice Inverse-Brier weight in ppm.
    /// @dev Defensively clamps `brierPpm` to `ONE_PPM`; callers pre-validate the bound.
    function weightPpm(uint32 brierPpm) internal pure returns (uint256) {
        uint256 b = brierPpm > ONE_PPM ? ONE_PPM : brierPpm;
        return (ONE_PPM - b) + 1;
    }

    /// @notice Map a confidence (ppm) to an unclamped-by-direction size in bps.
    /// @dev `(edgePpm + 125) / 250` is integer round-half-up of `edgePpm / 250`.
    function sizeBpsFromConfidence(uint32 confidencePpm) internal pure returns (uint16) {
        uint256 c = confidencePpm;
        uint256 edge = c >= HALF_PPM ? c - HALF_PPM : HALF_PPM - c;
        uint256 size = (edge + 125) / SIZE_DIVISOR;
        if (size > MAX_SIZE_BPS) size = MAX_SIZE_BPS;
        return uint16(size);
    }

    /// @notice Compute consensus from parallel arrays of contributing signals.
    /// @param brierPpm        Per-contributor Brier scores (ppm).
    /// @param isLong          Per-contributor side flags.
    /// @param probabilityPpm  Per-contributor stated probabilities (ppm).
    /// @param maxAgentWeightPpm Per-agent weight ceiling (ppm).
    /// @dev The caller passes only recognized + active contributors, so the array length is
    ///      the contributor count. Order is irrelevant (addition is associative).
    function compute(
        uint32[] memory brierPpm,
        bool[] memory isLong,
        uint32[] memory probabilityPpm,
        uint32 maxAgentWeightPpm
    ) internal pure returns (ConsensusResult memory result) {
        uint256 n = brierPpm.length;
        require(isLong.length == n && probabilityPpm.length == n, "length mismatch");
        if (n == 0) {
            return ConsensusResult({
                direction: Direction.FLAT,
                sizeBps: 0,
                confidencePpm: uint32(HALF_PPM),
                contributorCount: 0
            });
        }

        uint256 weightedLong;
        uint256 totalWeight;
        for (uint256 i = 0; i < n; i++) {
            uint256 w = weightPpm(brierPpm[i]);
            if (w > maxAgentWeightPpm) w = maxAgentWeightPpm;
            uint256 longProbPpm = isLong[i] ? uint256(probabilityPpm[i]) : (ONE_PPM - uint256(probabilityPpm[i]));
            weightedLong += w * longProbPpm;
            totalWeight += w * ONE_PPM;
        }

        if (totalWeight == 0) {
            return ConsensusResult({
                direction: Direction.FLAT,
                sizeBps: 0,
                confidencePpm: uint32(HALF_PPM),
                contributorCount: 0
            });
        }

        uint256 confidencePpm = (weightedLong * ONE_PPM) / totalWeight;

        Direction direction;
        if (confidencePpm > FLAT_UPPER_PPM) {
            direction = Direction.LONG;
        } else if (confidencePpm < FLAT_LOWER_PPM) {
            direction = Direction.SHORT;
        } else {
            direction = Direction.FLAT;
        }

        uint16 sizeBps = direction == Direction.FLAT ? 0 : sizeBpsFromConfidence(uint32(confidencePpm));

        result = ConsensusResult({
            direction: direction,
            sizeBps: sizeBps,
            confidencePpm: uint32(confidencePpm),
            contributorCount: uint32(n)
        });
    }
}
