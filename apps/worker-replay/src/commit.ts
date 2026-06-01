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
  scores: Array<{
    agentId: string;
    agentIdHex: `0x${string}`;
    brier: number;
    brierPpm: number;
  }>;
};

function loadPayload(): CommitReplayPayload {
  const payloadPath = resolve(process.cwd(), '../../data/artifacts/replay-commit-payload.json');
  const payload = JSON.parse(readFileSync(payloadPath, 'utf8')) as ReplayCommitFile;

  return {
    datasetHash: payload.datasetHash,
    scores: payload.scores.map((score) => ({
      agentIdHex: score.agentIdHex,
      brierPpm: score.brierPpm
    }))
  };
}

async function main() {
  const ledgerAddressRaw = process.env.SIBYL_LEDGER_ADDRESS;
  if (!ledgerAddressRaw) {
    throw new Error('SIBYL_LEDGER_ADDRESS is required');
  }

  const ledgerAddress = getAddress(ledgerAddressRaw);
  const payload = loadPayload();
  const calldata = encodeCommitReplayCalldata(payload);

  console.log('Commit payload summary:', {
    ledgerAddress,
    datasetHash: payload.datasetHash,
    scoreCount: payload.scores.length,
    calldataPreview: `${calldata.slice(0, 18)}...${calldata.slice(-16)}`
  });

  const privateKey = process.env.PRIVATE_KEY as Hex | undefined;
  const dryRun = process.env.COMMIT_REPLAY_DRY_RUN !== 'false';

  if (!privateKey || dryRun) {
    console.log('Running in dry-run simulation mode');
    await simulateCommitReplay(ledgerAddress, payload);
    console.log('Simulation success. Set COMMIT_REPLAY_DRY_RUN=false and PRIVATE_KEY to broadcast.');
    return;
  }

  const txHash = await commitReplayOnchain(ledgerAddress, payload, privateKey);
  console.log('Broadcasted commitReplay tx:', txHash);
}

main().catch((error) => {
  console.error('commitReplay client failed:', error);
  process.exit(1);
});
