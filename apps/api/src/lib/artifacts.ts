import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReplayScore } from '@sibyl/shared';

export type ReplayArtifact = {
  generatedAt: string;
  scoringVersion: string;
  datasetHash: string;
  rows: number;
  scores: ReplayScore[];
};

export type ReplayCommitPayload = {
  datasetHash: string;
  generatedAt: string;
  scoringVersion: string;
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
