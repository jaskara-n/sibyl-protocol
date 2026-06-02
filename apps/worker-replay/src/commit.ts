import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getAddress, type Hex } from 'viem';
import {
  commitReplayOnchain,
  encodeCommitReplayCalldata,
  simulateCommitReplay,
  type CommitReplayPayload
} from '@sibyl/sdk';

type ReplayCommitFile = {
  datasetHash: `0x${string}`;
  scoringVersionId: number;
  markets: Array<{
    marketId: string;
    marketIdHex: `0x${string}`;
    scores: Array<{
      agentId: string;
      agentIdHex: `0x${string}`;
      marketId: string;
      marketIdHex: `0x${string}`;
      brier: number;
      brierPpm: number;
    }>;
  }>;
};

// One commit payload per market — each market is committed independently on-chain.
function loadPayloads(): Array<{ symbol: string; payload: CommitReplayPayload }> {
  const payloadPath = resolve(process.cwd(), '../../data/artifacts/replay-commit-payload.json');
  const file = JSON.parse(readFileSync(payloadPath, 'utf8')) as ReplayCommitFile;

  return file.markets.map((market) => ({
    symbol: market.marketId,
    payload: {
      datasetHash: file.datasetHash,
      scoringVersion: file.scoringVersionId ?? 1,
      marketId: market.marketIdHex,
      scores: market.scores.map((score) => ({
        agentIdHex: score.agentIdHex,
        brierPpm: score.brierPpm
      }))
    }
  }));
}

async function main() {
  const ledgerAddressRaw = process.env.SIBYL_LEDGER_ADDRESS;
  if (!ledgerAddressRaw) {
    throw new Error('SIBYL_LEDGER_ADDRESS is required');
  }

  const ledgerAddress = getAddress(ledgerAddressRaw);
  const payloads = loadPayloads();

  const privateKey = process.env.PRIVATE_KEY as Hex | undefined;
  const dryRun = process.env.COMMIT_REPLAY_DRY_RUN !== 'false';

  for (const { symbol, payload } of payloads) {
    const calldata = encodeCommitReplayCalldata(payload);

    console.log('Commit payload summary:', {
      ledgerAddress,
      market: symbol,
      marketId: payload.marketId,
      datasetHash: payload.datasetHash,
      scoreCount: payload.scores.length,
      calldataPreview: `${calldata.slice(0, 18)}...${calldata.slice(-16)}`
    });

    if (!privateKey || dryRun) {
      console.log(`[${symbol}] Running in dry-run simulation mode`);
      await simulateCommitReplay(ledgerAddress, payload);
      console.log(`[${symbol}] Simulation success.`);
      continue;
    }

    const txHash = await commitReplayOnchain(ledgerAddress, payload, privateKey);
    console.log(`[${symbol}] Broadcasted commitReplay tx:`, txHash);
  }

  if (!privateKey || dryRun) {
    console.log('Set COMMIT_REPLAY_DRY_RUN=false and PRIVATE_KEY to broadcast.');
  }
}

main().catch((error) => {
  console.error('commitReplay client failed:', error);
  process.exit(1);
});
