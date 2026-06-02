import {
  createWalletClient,
  encodeFunctionData,
  getAddress,
  http,
  parseAbi,
  parseEventLogs,
  type Address,
  type Hex
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mantleSepoliaTestnet } from 'viem/chains';
import { mantleClient } from './index.js';

export const SIBYL_LEDGER_ABI = parseAbi([
  'function commitReplay(bytes32 datasetHash, uint32 scoringVersion, bytes32 marketId, (bytes32 agentId,uint32 brierPpm,uint64 updatedEpoch,bool active,bool exists,bytes32 marketId)[] scores)',
  'function latestDatasetHash() view returns (bytes32)',
  'function latestScoringVersion() view returns (uint32)',
  'function epoch() view returns (uint64)',
  'function maxAgentWeightPpm() view returns (uint32)',
  'function paused() view returns (bool)',
  'function owner() view returns (address)',
  'function registerMarket(bytes32 marketId)',
  'function setMarketActive(bytes32 marketId, bool active)',
  'function getMarkets() view returns (bytes32[])',
  'function isMarketActive(bytes32 marketId) view returns (bool)',
  'function convictionIndex(bytes32 marketId) view returns (uint256 totalWeight, uint32 activeAgentCount)',
  'function computeConsensus(bytes32 marketId, (bytes32 agentId, bytes32 marketId, bool isLong, uint32 probabilityPpm)[] signals) view returns ((uint8 direction, uint16 sizeBps, uint32 confidencePpm, uint32 contributorCount))',
  'function emitConsensus(bytes32 marketId, (bytes32 agentId, bytes32 marketId, bool isLong, uint32 probabilityPpm)[] signals) returns ((uint8 direction, uint16 sizeBps, uint32 confidencePpm, uint32 contributorCount))',
  'event ConsensusReached(bytes32 indexed marketId, uint8 direction, uint16 sizeBps, uint32 confidencePpm, uint32 contributorCount)'
]);

/// Direction enum codes as emitted on-chain (FLAT=0, LONG=1, SHORT=2).
export const DIRECTION_LABELS = ['FLAT', 'LONG', 'SHORT'] as const;

export type CommitReplayScore = {
  agentIdHex: `0x${string}`;
  brierPpm: number;
};

export type CommitReplayPayload = {
  datasetHash: `0x${string}`;
  scoringVersion: number;
  marketId: `0x${string}`;
  scores: CommitReplayScore[];
};

function toContractScores(marketId: `0x${string}`, scores: CommitReplayScore[]) {
  return scores.map((score) => ({
    agentId: score.agentIdHex,
    brierPpm: score.brierPpm,
    updatedEpoch: 0n,
    active: true,
    exists: true,
    marketId
  }));
}

export function encodeCommitReplayCalldata(payload: CommitReplayPayload): Hex {
  return encodeFunctionData({
    abi: SIBYL_LEDGER_ABI,
    functionName: 'commitReplay',
    args: [
      payload.datasetHash,
      payload.scoringVersion,
      payload.marketId,
      toContractScores(payload.marketId, payload.scores)
    ]
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
    args: [
      payload.datasetHash,
      payload.scoringVersion,
      payload.marketId,
      toContractScores(payload.marketId, payload.scores)
    ]
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
    args: [
      payload.datasetHash,
      payload.scoringVersion,
      payload.marketId,
      toContractScores(payload.marketId, payload.scores)
    ]
  });

  return walletClient.writeContract(request);
}

export type OnchainSignal = { agentId: Hex; marketId: Hex; isLong: boolean; probabilityPpm: number };

/// Broadcast emitConsensus to record a live ConsensusReached decision on-chain, then read the
/// result back from the emitted event. Owner-gated on the contract.
export async function emitConsensusOnchain(
  ledgerAddress: Address,
  marketId: Hex,
  signals: OnchainSignal[],
  privateKey: Hex
): Promise<{ txHash: Hex; direction: number; sizeBps: number; confidencePpm: number; contributorCount: number }> {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: mantleSepoliaTestnet,
    transport: http(process.env.MANTLE_RPC_URL)
  });

  const txHash = await walletClient.writeContract({
    address: ledgerAddress,
    abi: SIBYL_LEDGER_ABI,
    functionName: 'emitConsensus',
    args: [marketId, signals],
    account,
    chain: mantleSepoliaTestnet
  });
  const receipt = await mantleClient.waitForTransactionReceipt({ hash: txHash });
  const events = parseEventLogs({ abi: SIBYL_LEDGER_ABI, logs: receipt.logs, eventName: 'ConsensusReached' });
  if (events.length === 0) throw new Error(`ConsensusReached event not found in receipt ${txHash}`);
  const a = (events[0]?.args ?? {}) as Partial<ConsensusReachedEvent>;
  return {
    txHash,
    direction: Number(a.direction ?? 0),
    sizeBps: Number(a.sizeBps ?? 0),
    confidencePpm: Number(a.confidencePpm ?? 0),
    contributorCount: Number(a.contributorCount ?? 0)
  };
}

export type ConsensusReachedEvent = {
  marketId: Hex;
  direction: number;
  sizeBps: number;
  confidencePpm: number;
  contributorCount: number;
};

/// Subscribe to on-chain ConsensusReached events. The executor uses this to drive execution
/// from the ledger (the consensus-listener loop). Returns an unwatch function.
export function watchConsensusReached(
  ledgerAddress: Address,
  onConsensus: (event: ConsensusReachedEvent) => void
) {
  return mantleClient.watchContractEvent({
    address: ledgerAddress,
    abi: SIBYL_LEDGER_ABI,
    eventName: 'ConsensusReached',
    onLogs: (logs) => {
      for (const log of logs) {
        const a = log.args as Partial<ConsensusReachedEvent>;
        onConsensus({
          marketId: (a.marketId ?? `0x${'0'.repeat(64)}`) as Hex,
          direction: Number(a.direction ?? 0),
          sizeBps: Number(a.sizeBps ?? 0),
          confidencePpm: Number(a.confidencePpm ?? 0),
          contributorCount: Number(a.contributorCount ?? 0)
        });
      }
    }
  });
}
