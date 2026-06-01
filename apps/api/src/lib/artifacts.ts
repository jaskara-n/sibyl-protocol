import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReplayScore } from '@sibyl/shared';

export type ReplayArtifact = {
  generatedAt: string;
  scoringVersion: string;
  datasetHash: `0x${string}`;
  rows: number;
  scores: ReplayScore[];
};

export type ReplayCommitPayload = {
  datasetHash: `0x${string}`;
  generatedAt: string;
  scoringVersion: string;
  scoringVersionId: number;
  scores: Array<{
    agentId: string;
    agentIdHex: `0x${string}`;
    brier: number;
    brierPpm: number;
  }>;
};

export type TradeArtifact = {
  id: string;
  timestamp: number;
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'FLAT';
  sizeBps: number;
  confidence: number;
  contributors: string[];
  mode: 'paper';
};

function artifactsPath(file: string): string {
  return resolve(process.cwd(), '../../data/artifacts', file);
}

export function readReplayArtifact(): ReplayArtifact | null {
  const path = artifactsPath('replay-scores.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as ReplayArtifact;
}

export function readReplayCommitPayload(): ReplayCommitPayload | null {
  const path = artifactsPath('replay-commit-payload.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as ReplayCommitPayload;
}

export function readTradeArtifacts(): TradeArtifact[] {
  const path = artifactsPath('trade-events.json');
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8')) as TradeArtifact[];
}

export type FrozenSample = {
  timestamp: number;
  symbol: string;
  agentId: string;
  probability: number;
  outcome: number;
};

/// Frozen replay dataset (cols: timestamp,symbol,agent_id,probability,outcome).
/// Single source of truth: data/datasets/frozen/mnt_eth_sample.csv.
export function readFrozenSamples(): FrozenSample[] {
  const path = resolve(process.cwd(), '../../data/datasets/frozen/mnt_eth_sample.csv');
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];
  // Skip header row; columns are positional per the frozen schema.
  return lines.slice(1).map((line) => {
    const [timestamp, symbol, agentId, probability, outcome] = line.split(',');
    return {
      timestamp: Number(timestamp),
      symbol,
      agentId,
      probability: Number(probability),
      outcome: Number(outcome)
    };
  });
}

export type DeployedLedger = {
  address: `0x${string}`;
  network: string;
  chainId: number;
  explorer?: string;
  latestConsensusTx?: string;
};

/// Canonical on-chain deployment record (single source of truth: deployments/mantle-sepolia.json).
export function readDeployedLedger(): DeployedLedger | null {
  const path = resolve(process.cwd(), '../../deployments/mantle-sepolia.json');
  if (!existsSync(path)) return null;
  const d = JSON.parse(readFileSync(path, 'utf8')) as {
    network: string;
    chainId: number;
    explorer?: string;
    contracts: { SibylLedger: { address: `0x${string}` } };
    latestConsensus?: { tx?: string };
  };
  return {
    address: d.contracts.SibylLedger.address,
    network: d.network,
    chainId: d.chainId,
    explorer: d.explorer,
    latestConsensusTx: d.latestConsensus?.tx
  };
}
