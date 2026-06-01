import { createPublicClient, http } from 'viem';
import { mantleSepoliaTestnet } from 'viem/chains';

export const mantleClient = createPublicClient({
  chain: mantleSepoliaTestnet,
  transport: http(process.env.MANTLE_RPC_URL)
});

export function shortHash(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
