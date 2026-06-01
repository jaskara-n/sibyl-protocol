import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getAddress, type Hex } from 'viem';
import { DEFAULT_AGENTS } from '@sibyl/agents';
import { toPpm } from '@sibyl/shared';
import { toAgentId, emitConsensusOnchain } from '@sibyl/sdk';
import { fetchMarketSnapshot } from './marketData.js';

/// Records a live consensus decision on-chain via SibylLedger.emitConsensus — the hackathon's
/// "every agent decision recorded on Mantle" feature. Owner-gated; needs PRIVATE_KEY + RPC.

function resolveLedger(): `0x${string}` {
  if (process.env.SIBYL_LEDGER_ADDRESS) return getAddress(process.env.SIBYL_LEDGER_ADDRESS);
  const path = resolve(process.cwd(), '../../deployments/mantle-sepolia.json');
  const d = JSON.parse(readFileSync(path, 'utf8')) as { contracts: { SibylLedger: { address: string } } };
  return getAddress(d.contracts.SibylLedger.address);
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY as Hex | undefined;
  if (!privateKey) throw new Error('PRIVATE_KEY is required (contract owner) to emit consensus on-chain');

  const ledger = resolveLedger();
  const snapshot = await fetchMarketSnapshot();
  const rawSignals = await Promise.all(DEFAULT_AGENTS.map((agent) => agent.run(snapshot)));
  const signals = rawSignals.map((s) => ({
    agentId: toAgentId(s.agentId),
    isLong: s.direction !== 'SHORT',
    probabilityPpm: toPpm(s.probability)
  }));

  console.log(`Emitting consensus on-chain (${signals.length} signals) -> ${ledger}`);
  const res = await emitConsensusOnchain(ledger, signals, privateKey);
  const dir = ['FLAT', 'LONG', 'SHORT'][res.direction] ?? 'FLAT';
  console.log(
    `On-chain ConsensusReached: ${dir} ${res.sizeBps}bps conf=${(res.confidencePpm / 1e6 * 100).toFixed(1)}% contributors=${res.contributorCount}`
  );
  console.log('tx:', res.txHash);
}

main().catch((error) => {
  console.error('emit-onchain failed:', error);
  process.exit(1);
});
