import {
  createWalletClient,
  encodeFunctionData,
  getAddress,
  http,
  parseAbi,
  type Address,
  type Hex
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mantleSepoliaTestnet } from 'viem/chains';
import { mantleClient } from './index.js';

export const SIBYL_LEDGER_ABI = parseAbi([
  'function commitReplay(bytes32 datasetHash, uint32 scoringVersion, (bytes32 agentId,uint32 brierPpm,uint64 updatedEpoch,bool active,bool exists)[] scores)',
  'function latestDatasetHash() view returns (bytes32)',
  'function latestScoringVersion() view returns (uint32)',
  'function epoch() view returns (uint64)',
  'function maxAgentWeightPpm() view returns (uint32)',
  'function paused() view returns (bool)',
  'function owner() view returns (address)'
]);

export type CommitReplayScore = {
  agentIdHex: `0x${string}`;
  brierPpm: number;
};

export type CommitReplayPayload = {
  datasetHash: `0x${string}`;
  scoringVersion: number;
  scores: CommitReplayScore[];
};

function toContractScores(scores: CommitReplayScore[]) {
  return scores.map((score) => ({
    agentId: score.agentIdHex,
    brierPpm: score.brierPpm,
    updatedEpoch: 0n,
    active: true,
    exists: true
  }));
}

export function encodeCommitReplayCalldata(payload: CommitReplayPayload): Hex {
  return encodeFunctionData({
    abi: SIBYL_LEDGER_ABI,
    functionName: 'commitReplay',
    args: [payload.datasetHash, payload.scoringVersion, toContractScores(payload.scores)]
  });
}

export async function readLedgerState(ledgerAddress: Address) {
  const [latestDatasetHash, latestScoringVersion, epoch, maxAgentWeightPpm, paused, owner] = await Promise.all([
    mantleClient.readContract({ address: ledgerAddress, abi: SIBYL_LEDGER_ABI, functionName: 'latestDatasetHash' }),
    mantleClient.readContract({ address: ledgerAddress, abi: SIBYL_LEDGER_ABI, functionName: 'latestScoringVersion' }),
    mantleClient.readContract({ address: ledgerAddress, abi: SIBYL_LEDGER_ABI, functionName: 'epoch' }),
    mantleClient.readContract({ address: ledgerAddress, abi: SIBYL_LEDGER_ABI, functionName: 'maxAgentWeightPpm' }),
    mantleClient.readContract({ address: ledgerAddress, abi: SIBYL_LEDGER_ABI, functionName: 'paused' }),
    mantleClient.readContract({ address: ledgerAddress, abi: SIBYL_LEDGER_ABI, functionName: 'owner' })
  ]);

  return {
    latestDatasetHash,
    latestScoringVersion: Number(latestScoringVersion),
    epoch: Number(epoch),
    maxAgentWeightPpm: Number(maxAgentWeightPpm),
    paused,
    owner
  };
}

export async function simulateCommitReplay(ledgerAddress: Address, payload: CommitReplayPayload, caller?: Address) {
  const from = caller ?? getAddress('0x0000000000000000000000000000000000000001');

  return mantleClient.simulateContract({
    address: ledgerAddress,
    abi: SIBYL_LEDGER_ABI,
    functionName: 'commitReplay',
    account: from,
    args: [payload.datasetHash, payload.scoringVersion, toContractScores(payload.scores)]
  });
}

export async function commitReplayOnchain(ledgerAddress: Address, payload: CommitReplayPayload, privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: mantleSepoliaTestnet,
    transport: http(process.env.MANTLE_RPC_URL)
  });

  const { request } = await mantleClient.simulateContract({
    address: ledgerAddress,
    abi: SIBYL_LEDGER_ABI,
    functionName: 'commitReplay',
    account,
    args: [payload.datasetHash, payload.scoringVersion, toContractScores(payload.scores)]
  });

  return walletClient.writeContract(request);
}
