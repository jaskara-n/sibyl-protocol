import { parseAbi, type Address, type PublicClient } from 'viem';

/**
 * Sibyl agent reward distributor ABI surface (read subset).
 *
 * Derived from packages/contracts/src/RewardDistributor.sol + its interface
 * IRewardDistributor.sol. Holds the agent share of vault fees and pays out
 * per-epoch, pro-rata to an owner-defined allocation. Rewards are pull based and
 * each (epoch, agent) pair can be claimed at most once.
 */
export const REWARD_DISTRIBUTOR_ABI = parseAbi([
  'function rewardToken() view returns (address)',
  'function operator() view returns (address)',
  'function epochPool(uint64 epoch) view returns (uint256)',
  'function allocation(uint64 epoch, bytes32 agentId) view returns (uint256)',
  'function totalAllocation(uint64 epoch) view returns (uint256)',
  'function claimed(uint64 epoch, bytes32 agentId) view returns (bool)'
]);

/** Total reward tokens funded for an epoch. */
export async function readEpochPool(
  client: PublicClient,
  distributorAddr: Address,
  epoch: bigint
): Promise<bigint> {
  return client.readContract({
    address: distributorAddr,
    abi: REWARD_DISTRIBUTOR_ABI,
    functionName: 'epochPool',
    args: [epoch]
  });
}

/** Per-agent allocation weight within an epoch. */
export async function readAllocation(
  client: PublicClient,
  distributorAddr: Address,
  epoch: bigint,
  agentId: `0x${string}`
): Promise<bigint> {
  return client.readContract({
    address: distributorAddr,
    abi: REWARD_DISTRIBUTOR_ABI,
    functionName: 'allocation',
    args: [epoch, agentId]
  });
}

/** Whether an (epoch, agent) reward has already been claimed. */
export async function readClaimed(
  client: PublicClient,
  distributorAddr: Address,
  epoch: bigint,
  agentId: `0x${string}`
): Promise<boolean> {
  return client.readContract({
    address: distributorAddr,
    abi: REWARD_DISTRIBUTOR_ABI,
    functionName: 'claimed',
    args: [epoch, agentId]
  });
}
