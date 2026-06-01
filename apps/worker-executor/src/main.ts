import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeConsensus, type ReplayScore, type Signal } from '@sibyl/shared';
import { DEFAULT_AGENTS, type AgentInput } from '@sibyl/agents';
import { selectVenue, type ExecutionOrder } from './venue.js';
import { fetchMarketSnapshot } from './marketData.js';

type ReplayArtifact = {
  datasetHash: string;
  scores: ReplayScore[];
};

function readReplayArtifact(): ReplayArtifact {
  const path = resolve(process.cwd(), '../../data/artifacts/replay-scores.json');
  return JSON.parse(readFileSync(path, 'utf8')) as ReplayArtifact;
}

async function collectSignals(snapshot: AgentInput): Promise<Signal[]> {
  return Promise.all(DEFAULT_AGENTS.map((agent) => agent.run(snapshot)));
}

async function main() {
  const replay = readReplayArtifact();
  const snapshot = await fetchMarketSnapshot();
  const signals = await collectSignals(snapshot);
  const consensus = computeConsensus(signals, replay.scores);

  const order: ExecutionOrder = {
    id: `order-${snapshot.timestamp}`,
    timestamp: snapshot.timestamp,
    symbol: snapshot.symbol,
    direction: consensus.direction,
    sizeBps: consensus.sizeBps,
    confidence: Number(consensus.confidence.toFixed(6)),
    contributors: consensus.contributors
  };

  const venue = selectVenue();
  const receipt = await venue.execute(order);
  console.log('Executor decision:', { order, receipt });
}

main().catch((error) => {
  console.error('Executor failed:', error);
  process.exit(1);
});
