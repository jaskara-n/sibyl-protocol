import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { brierScore, type ReplayScore } from '@sibyl/shared';

type Row = {
  timestamp: number;
  symbol: string;
  agentId: string;
  probability: number;
  outcome: 0 | 1;
};

function parseCsv(filePath: string): Row[] {
  const raw = readFileSync(filePath, 'utf8').trim();
  const lines = raw.split('\n');
  const rows = lines.slice(1).map((line) => {
    const [timestamp, symbol, agentId, probability, outcome] = line.split(',');
    return {
      timestamp: Number(timestamp),
      symbol,
      agentId,
      probability: Number(probability),
      outcome: Number(outcome) as 0 | 1
    };
  });
  return rows;
}

type MarketScore = Required<Pick<ReplayScore, 'agentId' | 'marketId' | 'brier'>>;

// Per-(agent, market) Brier. The dataset carries a `symbol` column that is the marketId,
// so the same agent gets an independent score per market (independent reputation per market).
function computeScores(rows: Row[]): MarketScore[] {
  const map = new Map<string, { agentId: string; marketId: string; total: number; count: number }>();

  for (const row of rows) {
    const key = `${row.symbol}|${row.agentId}`;
    const existing = map.get(key) ?? { agentId: row.agentId, marketId: row.symbol, total: 0, count: 0 };
    existing.total += brierScore(row.probability, row.outcome);
    existing.count += 1;
    map.set(key, existing);
  }

  return [...map.values()].map((agg) => ({
    agentId: agg.agentId,
    marketId: agg.marketId,
    brier: Number((agg.total / agg.count).toFixed(6))
  }));
}

// Group flat per-(agent, market) scores into a `{ [marketId]: ReplayScore[] }` map.
function groupByMarket(scores: MarketScore[]): Record<string, MarketScore[]> {
  const byMarket: Record<string, MarketScore[]> = {};
  for (const score of scores) {
    (byMarket[score.marketId] ??= []).push(score);
  }
  return byMarket;
}

function hashDataset(content: string): string {
  return `0x${createHash('sha256').update(content).digest('hex')}`;
}

export function runReplay() {
  const datasetPath = resolve(process.cwd(), '../../data/datasets/frozen/mnt_eth_sample.csv');
  const artifactDir = resolve(process.cwd(), '../../data/artifacts');
  mkdirSync(artifactDir, { recursive: true });

  const datasetRaw = readFileSync(datasetPath, 'utf8');
  const datasetHash = hashDataset(datasetRaw);
  const rows = parseCsv(datasetPath);
  const scores = computeScores(rows);
  const byMarket = groupByMarket(scores);

  const output = {
    generatedAt: new Date().toISOString(),
    scoringVersion: 'brier_v1',
    // Numeric scoring version committed on-chain (uint32). Bump when the scoring
    // recipe changes so a new commit does not collide with a prior (hash, version).
    scoringVersionId: 1,
    datasetHash,
    rows: rows.length,
    markets: Object.keys(byMarket),
    // Flat list: every entry carries marketId (per-(agent, market) Brier).
    scores,
    // Same scores grouped/keyed by marketId for convenient per-market consumption.
    byMarket
  };

  writeFileSync(resolve(artifactDir, 'replay-scores.json'), JSON.stringify(output, null, 2));
  writeFileSync(resolve(artifactDir, 'dataset.hash'), `${datasetHash}\n`);

  return output;
}
