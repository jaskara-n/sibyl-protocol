import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getAddress, type Hex } from 'viem';
import { DEFAULT_AGENTS } from '@sibyl/agents';
import { computeConsensus, toPpm, DEFAULT_MAX_AGENT_WEIGHT_PPM, type ReplayScore, type Signal } from '@sibyl/shared';
import { toAgentId, emitConsensusOnchain, type OnchainSignal } from '@sibyl/sdk';
import { fetchMarketSnapshot } from './marketData.js';
import { getActiveMarkets, type Market } from './markets.js';

/// Per-market live consensus emission for SibylLedger.emitConsensus — the hackathon's
/// "every agent decision recorded on Mantle" feature.
///
/// SAFETY (this phase): DRY by default. We build the per-market on-chain signal set and compute
/// the consensus locally (the off-chain mirror of the contract) WITHOUT broadcasting. A real
/// owner-gated emitConsensus tx is only sent when EMIT_BROADCAST=1 and PRIVATE_KEY are both set.

type ReplayArtifact = { scores: ReplayScore[] };

function readScores(): ReplayScore[] {
  const path = resolve(process.cwd(), '../../data/artifacts/replay-scores.json');
  return (JSON.parse(readFileSync(path, 'utf8')) as ReplayArtifact).scores;
}

function resolveLedger(): `0x${string}` | null {
  if (process.env.SIBYL_LEDGER_ADDRESS) return getAddress(process.env.SIBYL_LEDGER_ADDRESS);
  const path = resolve(process.cwd(), '../../deployments/mantle-sepolia.json');
  if (!existsSync(path)) return null;
  try {
    const d = JSON.parse(readFileSync(path, 'utf8')) as { contracts?: { SibylLedger?: { address?: string } } };
    const addr = d.contracts?.SibylLedger?.address;
    return addr ? getAddress(addr) : null;
  } catch {
    return null;
  }
}

const DIRECTION_LABELS = ['FLAT', 'LONG', 'SHORT'] as const;

async function buildMarketSignals(market: Market): Promise<{ signals: Signal[]; onchain: OnchainSignal[] }> {
  const snapshot = await fetchMarketSnapshot(market.symbol);
  const raw = await Promise.all(DEFAULT_AGENTS.map((agent) => agent.run(snapshot)));
  const signals: Signal[] = raw.map((s) => ({ ...s, marketId: market.symbol }));
  const onchain: OnchainSignal[] = raw.map((s) => ({
    agentId: toAgentId(s.agentId),
    marketId: market.marketIdHex,
    isLong: s.direction !== 'SHORT',
    probabilityPpm: toPpm(s.probability)
  }));
  return { signals, onchain };
}

async function main() {
  const scores = readScores();
  const markets = await getActiveMarkets();
  const broadcast = process.env.EMIT_BROADCAST === '1';
  const privateKey = process.env.PRIVATE_KEY as Hex | undefined;
  const ledger = resolveLedger();

  console.log(`emit-onchain: ${markets.length} markets [${markets.map((m) => m.symbol).join(', ')}], broadcast=${broadcast}`);

  for (const market of markets) {
    const { signals, onchain } = await buildMarketSignals(market);

    // DRY preview: off-chain mirror of the on-chain consensus, scoped per market.
    const preview = computeConsensus(signals, scores, DEFAULT_MAX_AGENT_WEIGHT_PPM, market.symbol);
    console.log(
      `[${market.symbol}] dry consensus: ${preview.direction} ${preview.sizeBps}bps conf=${(preview.confidence * 100).toFixed(1)}% contributors=${preview.contributors.length}`
    );

    if (!broadcast) continue;

    if (!privateKey) throw new Error('EMIT_BROADCAST=1 requires PRIVATE_KEY (contract owner)');
    if (!ledger) throw new Error('EMIT_BROADCAST=1 requires SIBYL_LEDGER_ADDRESS or a deployments file');

    console.log(`[${market.symbol}] broadcasting emitConsensus (${onchain.length} signals) -> ${ledger}`);
    const res = await emitConsensusOnchain(ledger, market.marketIdHex, onchain, privateKey);
    const dir = DIRECTION_LABELS[res.direction] ?? 'FLAT';
    console.log(
      `[${market.symbol}] on-chain ConsensusReached: ${dir} ${res.sizeBps}bps conf=${((res.confidencePpm / 1e6) * 100).toFixed(1)}% contributors=${res.contributorCount} tx=${res.txHash}`
    );
  }
}

main().catch((error) => {
  console.error('emit-onchain failed:', error);
  process.exit(1);
});
