import { parseAbi, type Address, type PublicClient } from 'viem';

/**
 * Sibyl agent bonding contract ABI surface (read subset).
 *
 * Derived from packages/contracts/src/AgentBond.sol + its interface
 * IAgentBond.sol. Agents post a refundable ERC20 bond that can be slashed ONLY on
 * a provable commit/reveal mismatch (fraud). There is no being-wrong slash path.
 */
export const AGENT_BOND_ABI = parseAbi([
  'function bondToken() view returns (address)',
  'function operator() view returns (address)',
  'function slashSink() view returns (address)',
  'function stakeOf(bytes32 agentId) view returns (uint256)',
  'function bonded(bytes32 agentId) view returns (bool)'
]);

/** Currently staked bond for `agentId`. */
export async function readStakeOf(
  client: PublicClient,
  bondAddr: Address,
  agentId: `0x${string}`
): Promise<bigint> {
  return client.readContract({
    address: bondAddr,
    abi: AGENT_BOND_ABI,
    functionName: 'stakeOf',
    args: [agentId]
  });
}

/** Whether `agentId` currently has an active (refundable) bond. */
export async function readBonded(
  client: PublicClient,
  bondAddr: Address,
  agentId: `0x${string}`
): Promise<boolean> {
  return client.readContract({
    address: bondAddr,
    abi: AGENT_BOND_ABI,
    functionName: 'bonded',
    args: [agentId]
  });
}
