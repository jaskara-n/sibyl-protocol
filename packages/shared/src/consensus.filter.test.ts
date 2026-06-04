import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeConsensus, type Signal, type ReplayScore } from './index.js';

// computeConsensus with a marketId filter must yield the SAME ppm-derived result as the
// equivalent pre-filtered single-market call. marketId is scoping only and must never change
// the canonical math.
const MKT_A = 'market-a';
const MKT_B = 'market-b';

const signals: Signal[] = [
  { agentId: 'a1', marketId: MKT_A, timestamp: 1, symbol: 'ETH', direction: 'LONG', probability: 0.8 },
  { agentId: 'a2', marketId: MKT_A, timestamp: 1, symbol: 'ETH', direction: 'SHORT', probability: 0.3 },
  { agentId: 'b1', marketId: MKT_B, timestamp: 1, symbol: 'BTC', direction: 'LONG', probability: 0.9 },
  { agentId: 'b2', marketId: MKT_B, timestamp: 1, symbol: 'BTC', direction: 'LONG', probability: 0.2 }
];

const scores: ReplayScore[] = [
  { agentId: 'a1', marketId: MKT_A, brier: 0.05 },
  { agentId: 'a2', marketId: MKT_A, brier: 0.4 },
  { agentId: 'b1', marketId: MKT_B, brier: 0.1 },
  { agentId: 'b2', marketId: MKT_B, brier: 0.6 }
];

test('marketId filter equals equivalent pre-filtered single-market call', () => {
  const filtered = computeConsensus(signals, scores, undefined, MKT_A);

  const preSignals = signals.filter((s) => s.marketId === MKT_A);
  const preScores = scores.filter((s) => s.marketId === MKT_A);
  const manual = computeConsensus(preSignals, preScores);

  assert.equal(filtered.direction, manual.direction, 'direction');
  assert.equal(filtered.confidence, manual.confidence, 'confidence');
  assert.equal(filtered.sizeBps, manual.sizeBps, 'sizeBps');
  assert.deepEqual(filtered.contributors, manual.contributors, 'contributors');
});

test('marketId filter excludes other-market signals and stamps marketId', () => {
  const a = computeConsensus(signals, scores, undefined, MKT_A);
  assert.equal(a.marketId, MKT_A, 'result stamped with marketId');
  // Only market-A agents contribute.
  assert.deepEqual(a.contributors.sort(), ['a1', 'a2'], 'only market-A contributors');

  const b = computeConsensus(signals, scores, undefined, MKT_B);
  assert.deepEqual(b.contributors.sort(), ['b1', 'b2'], 'only market-B contributors');
});

test('unscoped scores apply to any filtered market', () => {
  const unscopedScores: ReplayScore[] = [
    { agentId: 'a1', brier: 0.05 },
    { agentId: 'a2', brier: 0.4 }
  ];
  const filtered = computeConsensus(signals, unscopedScores, undefined, MKT_A);
  assert.deepEqual(filtered.contributors.sort(), ['a1', 'a2'], 'unscoped scores apply');
});

test('no marketId leaves result unstamped and math unchanged', () => {
  const res = computeConsensus(signals, scores);
  assert.equal(res.marketId, undefined, 'no marketId stamp when omitted');
});
