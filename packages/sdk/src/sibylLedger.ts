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
  'function commitReplay(bytes32 datasetHash, (bytes32 agentId,uint32 brierPpm,bool exists)[] agentScores)'
]);

export type CommitReplayScore = {
  agentIdHex: `0x${string}`;
  brierPpm: number;
};

export type CommitReplayPayload = {
  datasetHash: `0x${string}`;
  scores: CommitReplayScore[];
};

export function encodeCommitReplayCalldata(payload: CommitReplayPayload): Hex {
  return encodeFunctionData({
    abi: SIBYL_LEDGER_ABI,
    functionName: 'commitReplay',
    args: [
      payload.datasetHash,
      payload.scores.map((score) => ({
        agentId: score.agentIdHex,
        brierPpm: score.brierPpm,
        exists: true
      }))
    ]
  });
}

export async function simulateCommitReplay(
  ledgerAddress: Address,
  payload: CommitReplayPayload,
  caller?: Address
) {
  const from = caller ?? getAddress('0x0000000000000000000000000000000000000001');

  return mantleClient.simulateContract({
    address: ledgerAddress,
    abi: SIBYL_LEDGER_ABI,
    functionName: 'commitReplay',
    account: from,
    args: [
      payload.datasetHash,
      payload.scores.map((score) => ({
        agentId: score.agentIdHex,
        brierPpm: score.brierPpm,
        exists: true
      }))
    ]
  });
}

export async function commitReplayOnchain(
  ledgerAddress: Address,
  payload: CommitReplayPayload,
  privateKey: Hex
) {
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
    args: [
      payload.datasetHash,
      payload.scores.map((score) => ({
        agentId: score.agentIdHex,
        brierPpm: score.brierPpm,
        exists: true
      }))
    ]
  });

  const txHash = await walletClient.writeContract(request);
  return txHash;
}
