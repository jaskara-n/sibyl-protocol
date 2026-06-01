// Deterministic generator for the frozen replay dataset.
//
// Produces a reproducible, synthetic-but-realistic calibration dataset: 300 windows x 5 agents.
// Determinism (no Math.random) is the whole point — anyone can re-run this and get a
// bit-identical CSV, which is what makes the on-chain dataset hash verifiable.
//
// Each agent has a calibration profile (confidence + error rate). The resulting Brier scores
// separate the agents the way the demo narrative needs:
//   momentum_v1 (best)  <  onchain_oi_v1  <  funding_v1  <  news_v1  <<  rogue_10x_v1 (worst)
//
// Usage: node data/datasets/generate-frozen.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const WINDOWS = 300;
const BASE_TS = 1_717_000_000;
const STEP = 3600;
const SYMBOL = 'MNT-USD';

// Deterministic hash -> [0, 1)
function rand(n) {
  let x = (n ^ 0x9e3779b9) | 0;
  x ^= x << 13;
  x |= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x |= 0;
  return (x >>> 0) % 1_000_000 / 1_000_000;
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round3 = (v) => Math.round(v * 1000) / 1000;

// agentId, seed, confidence, errorRate. (rogue handled specially)
const AGENTS = [
  { id: 'momentum_v1', seed: 11, conf: 0.72, err: 0.18 },
  { id: 'onchain_oi_v1', seed: 23, conf: 0.70, err: 0.25 },
  { id: 'funding_v1', seed: 37, conf: 0.68, err: 0.30 },
  { id: 'news_v1', seed: 53, conf: 0.65, err: 0.33 },
  { id: 'rogue_10x_v1', seed: 71, conf: 0.95, err: null } // always loud, calibration-blind
];

const rows = ['timestamp,symbol,agent_id,probability,outcome'];
const briers = Object.fromEntries(AGENTS.map((a) => [a.id, { total: 0, n: 0 }]));

for (let i = 0; i < WINDOWS; i++) {
  const ts = BASE_TS + i * STEP;
  const outcome = rand(i * 7919 + 1) >= 0.5 ? 1 : 0;

  for (const a of AGENTS) {
    let q;
    if (a.id === 'rogue_10x_v1') {
      // Overconfident and calibration-blind: always screams ~0.95 on a coin-flip side.
      q = rand(i * 131 + a.seed) >= 0.5 ? 0.95 : 0.05;
    } else {
      const correct = rand(i * 101 + a.seed) >= a.err;
      const trueSide = correct ? a.conf : 1 - a.conf;
      const base = outcome === 1 ? trueSide : 1 - trueSide;
      const jitter = (rand(i * 313 + a.seed * 17) - 0.5) * 0.06;
      q = clamp(round3(base + jitter), 0.02, 0.98);
    }
    rows.push(`${ts},${SYMBOL},${a.id},${q},${outcome}`);
    const b = briers[a.id];
    b.total += (q - outcome) ** 2;
    b.n += 1;
  }
}

const outPath = resolve(__dirname, 'frozen/mnt_eth_sample.csv');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, rows.join('\n') + '\n');

console.log(`wrote ${rows.length - 1} rows (${WINDOWS} windows x ${AGENTS.length} agents) -> ${outPath}`);
console.log('resulting Brier scores (lower = better calibrated):');
for (const a of AGENTS) {
  const b = briers[a.id];
  console.log(`  ${a.id.padEnd(14)} ${(b.total / b.n).toFixed(4)}`);
}
