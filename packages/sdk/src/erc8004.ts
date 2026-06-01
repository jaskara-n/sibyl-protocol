import { getAddress, parseAbi, type Address } from 'viem';
import { mantleClient } from './index.js';

/**
 * ERC-8004 ("Trustless Agents") registry integration.
 *
 * ERC-8004 went live on Ethereum mainnet on 2026-01-29 and is deployed at deterministic
 * CREATE2 addresses that are IDENTICAL across 40+ chains, including Mantle. The Turing Test
 * Hackathon issues every participating agent an ERC-8004 identity NFT, so wiring Sibyl agents
 * to these registries is the intended "ecosystem fit" path.
 *
 * Source: https://github.com/erc-8004/erc-8004-contracts
 *
 * NOTE: Addresses below are verified from the registry repo. The ABI fragments are the minimal
 * subset Sibyl reads; validate them against the deployed ABI before sending any on-chain WRITES.
 * The Mantle *Sepolia testnet* deployment should be confirmed on-chain before relying on the
 * testnet addresses (mainnet is confirmed).
 */
export const ERC8004_ADDRESSES = {
  mainnet: {
    identityRegistry: getAddress('0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'),
    reputationRegistry: getAddress('0x8004BAa17C55a88189AE136b182e5fdA19dE9b63')
  },
  testnet: {
    identityRegistry: getAddress('0x8004A818BFB912233c491871b3d84c89A494BD9e'),
    reputationRegistry: getAddress('0x8004B663056A597Dffe9eCcC1965A193B7388713')
  }
} as const;

export type Erc8004Network = keyof typeof ERC8004_ADDRESSES;

/// Resolve registry addresses for a network (defaults to testnet, Sibyl's demo target).
export function erc8004Addresses(network: Erc8004Network = 'testnet') {
  return ERC8004_ADDRESSES[network];
}

export const ERC8004_IDENTITY_ABI = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getAgentWallet(uint256 agentId) view returns (address)',
  'function getMetadata(uint256 agentId, string metadataKey) view returns (bytes)'
]);

export const ERC8004_REPUTATION_ABI = parseAbi([
  'function getSummary(uint256 agentId, address[] clientAddresses, bytes32 tag1, bytes32 tag2) view returns (uint64 count, int128 value, uint8 decimals)'
]);

const ZERO_TAG = `0x${'00'.repeat(32)}` as const;

/// The wallet an agent has verified as its receiving address (ERC-8004 Identity registry).
export async function readAgentWallet(identityRegistry: Address, agentId: bigint): Promise<Address> {
  return mantleClient.readContract({
    address: identityRegistry,
    abi: ERC8004_IDENTITY_ABI,
    functionName: 'getAgentWallet',
    args: [agentId]
  });
}

/// Aggregate reputation feedback for an agent (ERC-8004 Reputation registry).
export async function readReputationSummary(
  reputationRegistry: Address,
  agentId: bigint,
  clientAddresses: Address[] = []
) {
  const [count, value, decimals] = await mantleClient.readContract({
    address: reputationRegistry,
    abi: ERC8004_REPUTATION_ABI,
    functionName: 'getSummary',
    args: [agentId, clientAddresses, ZERO_TAG, ZERO_TAG]
  });
  return { count, value, decimals };
}
