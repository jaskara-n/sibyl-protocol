import { createPublicClient, http, keccak256, toBytes } from 'viem';
import { mantleSepoliaTestnet } from 'viem/chains';

export const mantleClient = createPublicClient({
  chain: mantleSepoliaTestnet,
  transport: http(process.env.MANTLE_RPC_URL)
});

export function shortHash(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function toAgentId(agentId: string): `0x${string}` {
  return keccak256(toBytes(agentId));
}

export function brierToPpm(brier: number): number {
  const ppm = Math.round(Math.max(0, Math.min(1, brier)) * 1_000_000);
  return ppm;
}

export * from './sibylLedger.js';
export * from './erc8004.js';
export * from './sibylVault.js';
export * from './predictionMarket.js';
export * from './rewardDistributor.js';
export * from './agentBond.js';
