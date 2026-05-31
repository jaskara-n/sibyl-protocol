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

function computeScores(rows: Row[]): ReplayScore[] {
  const map = new Map<string, { total: number; count: number }>();

  for (const row of rows) {
    const existing = map.get(row.agentId) ?? { total: 0, count: 0 };
    existing.total += brierScore(row.probability, row.outcome);
    existing.count += 1;
    map.set(row.agentId, existing);
  }

  return [...map.entries()].map(([agentId, agg]) => ({
    agentId,
    brier: Number((agg.total / agg.count).toFixed(6))
  }));
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

  const output = {
    generatedAt: new Date().toISOString(),
    scoringVersion: 'brier_v1',
    datasetHash,
    rows: rows.length,
    scores
  };

  writeFileSync(resolve(artifactDir, 'replay-scores.json'), JSON.stringify(output, null, 2));
  writeFileSync(resolve(artifactDir, 'dataset.hash'), `${datasetHash}\n`);

  return output;
}
