import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReplayScore } from '@sibyl/shared';

/// Per-market replay-scores.json shape. `scores` is the flat list of per-market
/// per-agent Brier scores (each carries its `marketId`), `markets` is the registered
/// market id list, and `byMarket` indexes the same scores by marketId for convenience.
export type ReplayArtifact = {
  generatedAt: string;
  scoringVersion: string;
  scoringVersionId?: number;
  datasetHash: `0x${string}`;
  rows: number;
  markets: string[];
  scores: ReplayScore[];
  byMarket: Record<string, ReplayScore[]>;
};

export type ReplayCommitScore = {
  agentId: string;
  agentIdHex: `0x${string}`;
  marketId: string;
  marketIdHex: `0x${string}`;
  brier: number;
  brierPpm: number;
};

/// Per-market commit payload entry: the on-chain marketId + its scores + encoded calldata.
export type ReplayCommitMarket = {
  marketId: string;
  marketIdHex: `0x${string}`;
  scores: ReplayCommitScore[];
  calldata: `0x${string}`;
};

/// Multi-market replay commit payload (one entry per market under `markets`).
export type ReplayCommitPayload = {
  datasetHash: `0x${string}`;
  generatedAt: string;
  scoringVersion: string;
  scoringVersionId: number;
  markets: ReplayCommitMarket[];
};

export type TradeArtifact = {
  id: string;
  marketId: string;
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
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<ReplayArtifact>;
  // Defensive defaults so older single-market artifacts still parse.
  return {
    generatedAt: parsed.generatedAt ?? '',
    scoringVersion: parsed.scoringVersion ?? '',
    scoringVersionId: parsed.scoringVersionId,
    datasetHash: parsed.datasetHash ?? ('0x' as `0x${string}`),
    rows: parsed.rows ?? 0,
    markets: parsed.markets ?? [],
    scores: parsed.scores ?? [],
    byMarket: parsed.byMarket ?? {}
  };
}

/// The set of markets the demo runs over. Source of truth: the replay artifact's
/// `markets` list; falls back to the static multi-market config so the paper dry-run
/// works fully offline (no RPC / deployment), matching the executor's FALLBACK_MARKETS.
export const FALLBACK_MARKETS: readonly string[] = ['MNT-USD', 'ETH-USD'];

export function listMarkets(): string[] {
  const replay = readReplayArtifact();
  if (replay && replay.markets.length > 0) return replay.markets;
  return [...FALLBACK_MARKETS];
}

/// The default market used by legacy (market-blind) endpoints for back-compat.
export function defaultMarketId(): string {
  return listMarkets()[0] ?? FALLBACK_MARKETS[0];
}

/// Replay scores scoped to a market. When `marketId` is omitted the scores are
/// aggregated across all markets: each agent's Brier is averaged over the markets
/// it appears in, so an agent's overall reputation reflects every market it scored.
export function scoresForMarket(replay: ReplayArtifact, marketId?: string): ReplayScore[] {
  if (marketId !== undefined) {
    if (replay.byMarket[marketId]) return replay.byMarket[marketId];
    return replay.scores.filter((s) => s.marketId === marketId);
  }
  const byAgent = new Map<string, { sum: number; n: number }>();
  for (const s of replay.scores) {
    const acc = byAgent.get(s.agentId) ?? { sum: 0, n: 0 };
    acc.sum += s.brier;
    acc.n += 1;
    byAgent.set(s.agentId, acc);
  }
  return [...byAgent.entries()].map(([agentId, { sum, n }]) => ({
    agentId,
    brier: n === 0 ? 0 : sum / n
  }));
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

export type DeployedVault = {
  address: `0x${string}`;
  network: string;
  chainId: number;
  explorer?: string;
};

/// Optional ERC-4626 vault deployment record. Returns null when no vault address is
/// configured (the common case for the offline paper dry-run), so callers must use the
/// artifact/snapshot fallback. Source of truth: deployments/mantle-sepolia.json +
/// SIBYL_VAULT_ADDRESS env override.
export function readDeployedVault(): DeployedVault | null {
  const path = resolve(process.cwd(), '../../deployments/mantle-sepolia.json');
  let d: {
    network?: string;
    chainId?: number;
    explorer?: string;
    contracts?: { SibylVault?: { address?: string | null } };
  } = {};
  if (existsSync(path)) {
    d = JSON.parse(readFileSync(path, 'utf8'));
  }
  const envAddr = process.env.SIBYL_VAULT_ADDRESS;
  const address = envAddr ?? d.contracts?.SibylVault?.address ?? null;
  if (!address) return null;
  return {
    address: address as `0x${string}`,
    network: d.network ?? 'mantle-sepolia',
    chainId: d.chainId ?? 5003,
    explorer: d.explorer
  };
}

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
