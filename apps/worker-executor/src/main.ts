import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeConsensus, DEFAULT_MAX_AGENT_WEIGHT_PPM, type ReplayScore, type Signal } from '@sibyl/shared';
import { DEFAULT_AGENTS, type AgentInput } from '@sibyl/agents';
import { selectVenue, type ExecutionOrder } from './venue.js';
import { fetchMarketSnapshot } from './marketData.js';
import { getActiveMarkets, type Market } from './markets.js';

type ReplayArtifact = {
  datasetHash: string;
  scores: ReplayScore[];
};

function readReplayArtifact(): ReplayArtifact {
  const path = resolve(process.cwd(), '../../data/artifacts/replay-scores.json');
  return JSON.parse(readFileSync(path, 'utf8')) as ReplayArtifact;
}

/// Run every agent on the market snapshot and stamp each Signal with the market's id so
/// computeConsensus can scope to this market. (Agents are market-agnostic; the caller owns marketId.)
async function collectSignals(snapshot: AgentInput, marketId: string): Promise<Signal[]> {
  const raw = await Promise.all(DEFAULT_AGENTS.map((agent) => agent.run(snapshot)));
  return raw.map((s) => ({ ...s, marketId }));
}

async function runMarket(
  market: Market,
  scores: ReplayScore[],
  venue: ReturnType<typeof selectVenue>
) {
  const snapshot = await fetchMarketSnapshot(market.symbol);
  const signals = await collectSignals(snapshot, market.symbol);

  // Scope consensus to this market: per-(agent, market) Brier + market-stamped signals.
  const consensus = computeConsensus(signals, scores, DEFAULT_MAX_AGENT_WEIGHT_PPM, market.symbol);

  const order: ExecutionOrder = {
    id: `order-${market.symbol}-${snapshot.timestamp}`,
    marketId: market.symbol,
    timestamp: snapshot.timestamp,
    symbol: snapshot.symbol,
    direction: consensus.direction,
    sizeBps: consensus.sizeBps,
    confidence: Number(consensus.confidence.toFixed(6)),
    contributors: consensus.contributors
  };

  const receipt = await venue.execute(order);
  console.log(`Executor decision [${market.symbol}]:`, { order, receipt });
  return { order, receipt };
}

async function main() {
  const replay = readReplayArtifact();
  const markets = await getActiveMarkets();
  if (markets.length === 0) {
    console.warn('No active markets resolved; nothing to execute.');
    return;
  }

  const venue = selectVenue();
  console.log(`Executor venue=${venue.name}, markets=${markets.map((m) => m.symbol).join(', ')}`);

  // Loop the markets, executing one decision per market.
  for (const market of markets) {
    await runMarket(market, replay.scores, venue);
  }
}

main().catch((error) => {
  console.error('Executor failed:', error);
  process.exit(1);
});
