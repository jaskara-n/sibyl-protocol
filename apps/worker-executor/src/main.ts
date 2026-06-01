import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeConsensus, type ReplayScore, type Signal } from '@sibyl/shared';
import { DEFAULT_AGENTS, type AgentInput } from '@sibyl/agents';

type ReplayArtifact = {
  datasetHash: string;
  scores: ReplayScore[];
};

type TradeEvent = {
  id: string;
  timestamp: number;
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'FLAT';
  sizeBps: number;
  confidence: number;
  contributors: string[];
  mode: 'paper';
};

function readReplayArtifact(): ReplayArtifact {
  const path = resolve(process.cwd(), '../../data/artifacts/replay-scores.json');
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as ReplayArtifact;
}

function buildSnapshot(symbol = 'MNT-USD'): AgentInput {
  const now = Math.floor(Date.now() / 1000);
  const phase = Math.sin(now / 3600);
  return {
    symbol,
    timestamp: now,
    price: 0.85 + phase * 0.03,
    fundingRate: 0.002 * Math.cos(now / 1800),
    oiDelta: Math.sin(now / 2400),
    momentum: Math.sin(now / 1200),
    newsSentiment: Math.cos(now / 2700)
  };
}

async function collectSignals(snapshot: AgentInput): Promise<Signal[]> {
  return Promise.all(DEFAULT_AGENTS.map((agent) => agent.run(snapshot)));
}

function persistTrade(event: TradeEvent): void {
  const artifactDir = resolve(process.cwd(), '../../data/artifacts');
  const tradesPath = resolve(artifactDir, 'trade-events.json');
  mkdirSync(artifactDir, { recursive: true });

  const existing: TradeEvent[] = existsSync(tradesPath)
    ? (JSON.parse(readFileSync(tradesPath, 'utf8')) as TradeEvent[])
    : [];

  existing.unshift(event);
  writeFileSync(tradesPath, JSON.stringify(existing.slice(0, 100), null, 2));
}

async function main() {
  const replay = readReplayArtifact();
  const snapshot = buildSnapshot();
  const signals = await collectSignals(snapshot);
  const consensus = computeConsensus(signals, replay.scores);

  const trade: TradeEvent = {
    id: `paper-${snapshot.timestamp}`,
    timestamp: snapshot.timestamp,
    symbol: snapshot.symbol,
    direction: consensus.direction,
    sizeBps: consensus.sizeBps,
    confidence: Number(consensus.confidence.toFixed(6)),
    contributors: consensus.contributors,
    mode: 'paper'
  };

  persistTrade(trade);
  console.log('Executor emitted trade event:', trade);
}

main().catch((error) => {
  console.error('Executor failed:', error);
  process.exit(1);
});
