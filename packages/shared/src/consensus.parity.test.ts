import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeConsensusPpm } from './index.js';

// The SAME frozen golden vectors asserted by the Solidity parity test
// (packages/contracts/test/ConsensusParity.t.sol). If the TS port and the Solidity
// library ever diverge, exactly one of these two suites fails.
//
// WHY this fixture stays byte-identical (16 vectors, never edited by this phase):
// the consensus math is purely a function of (brierPpm[], isLong[], probabilityPpm[],
// maxAgentWeightPpm). marketId is routing/scoping only — it selects WHICH signals and
// scores feed the computation and rides on the event + call arg, but it never enters
// the ppm arrays and so cannot change any output. Adding marketId to the Signal/
// AgentScore wire types is therefore non-mathematical: the golden vectors (and the
// frozen weightPpm/computeConsensusPpm implementation they gate) are unaffected.
const fixturePath = resolve(process.cwd(), '../contracts/test/fixtures/consensus-vectors.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  vectors: Array<{
    name: string;
    brierPpm: number[];
    isLong: boolean[];
    probabilityPpm: number[];
    maxAgentWeightPpm: number;
    expected: { direction: number; sizeBps: number; confidencePpm: number; contributorCount: number };
  }>;
};

test('parity: golden vectors match canonical computeConsensusPpm', () => {
  for (const v of fixture.vectors) {
    const r = computeConsensusPpm(v.brierPpm, v.isLong, v.probabilityPpm, v.maxAgentWeightPpm);
    assert.deepEqual(
      {
        direction: r.direction,
        sizeBps: r.sizeBps,
        confidencePpm: r.confidencePpm,
        contributorCount: r.contributorCount
      },
      v.expected,
      `vector ${v.name}`
    );
  }
});

test('property: flip-long symmetry, range, and FLAT-iff-in-band', () => {
  for (let i = 0; i < 500; i++) {
    const brier = [(i * 4999) % 1_000_001];
    const prob = [(i * 7919) % 1_000_001];
    const up = computeConsensusPpm(brier, [true], prob, 1_000_001);
    const down = computeConsensusPpm(brier, [false], prob, 1_000_001);

    assert.equal(down.confidencePpm, 1_000_000 - up.confidencePpm, 'symmetry');
    assert.equal(down.sizeBps, up.sizeBps, 'symmetric size');
    assert.ok(up.confidencePpm >= 0 && up.confidencePpm <= 1_000_000, 'confidence range');
    assert.ok(up.sizeBps >= 0 && up.sizeBps <= 2_000, 'size range');

    const inBand = up.confidencePpm >= 495_000 && up.confidencePpm <= 505_000;
    assert.equal(up.direction === 0, inBand, 'FLAT iff in band');
    if (up.direction === 0) assert.equal(up.sizeBps, 0, 'FLAT => size 0');
  }
});
