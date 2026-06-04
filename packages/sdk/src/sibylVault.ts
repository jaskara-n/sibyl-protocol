import { parseAbi, type Address, type PublicClient } from 'viem';

/**
 * Sibyl ERC-4626 strategy vault ABI surface (read subset).
 *
 * Derived from packages/contracts/src/SibylVault.sol + its ERC4626 base
 * (packages/contracts/src/tokens/ERC4626.sol). The vault routes idle cash into
 * SPOT venue positions; NAV = idle cash + sum of venue positionValue over the
 * configured markets. There is no leverage/borrow path.
 *
 * Note: the on-chain ERC4626 base does NOT implement the optional ERC-4626 max*
 * methods, so {readMaxWithdraw} derives `maxWithdraw(owner)` client-side as
 * previewRedeem(balanceOf(owner)) — the assets the owner can pull by redeeming
 * their full share balance.
 */
export const SIBYL_VAULT_ABI = parseAbi([
  'function asset() view returns (address)',
  'function venue() view returns (address)',
  'function ledger() view returns (address)',
  'function totalAssets() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function convertToShares(uint256 assets) view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function previewDeposit(uint256 assets) view returns (uint256)',
  'function previewMint(uint256 shares) view returns (uint256)',
  'function previewWithdraw(uint256 assets) view returns (uint256)',
  'function previewRedeem(uint256 shares) view returns (uint256)',
  'function maxBps(bytes32 marketId) view returns (uint16)',
  'function consensusDirection(bytes32 marketId) view returns (uint8)',
  'function consensusSizeBps(bytes32 marketId) view returns (uint16)',
  'function highWaterMark() view returns (uint256)',
  'function takeRateBps() view returns (uint16)',
  'function feeRecipient() view returns (address)'
]);

/** SPOT execution venue ABI surface (read subset). */
export const EXECUTION_VENUE_ABI = parseAbi([
  'function positionValue(bytes32 marketId) view returns (uint256)',
  'function positionToken() view returns (address)'
]);

/** Minimal ERC20 read surface used for the vault's idle-cash balance. */
export const ERC20_BALANCE_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)'
]);

/** Minimal ledger read surface for the conviction index (sizing input). */
export const LEDGER_CONVICTION_ABI = parseAbi([
  'function convictionIndex(bytes32 marketId) view returns (uint256 totalWeight, uint32 activeAgentCount)'
]);

export type Conviction = { totalWeight: bigint; activeAgentCount: number };

/**
 * Read the reputation-weighted conviction index for `marketId` from the ledger:
 * the summed agent weight and the active-agent count the vault sizes exposure by.
 */
export async function readConviction(
  client: PublicClient,
  ledgerAddr: Address,
  marketId: `0x${string}`
): Promise<Conviction> {
  const [totalWeight, activeAgentCount] = await client.readContract({
    address: ledgerAddr,
    abi: LEDGER_CONVICTION_ABI,
    functionName: 'convictionIndex',
    args: [marketId]
  });
  return { totalWeight, activeAgentCount: Number(activeAgentCount) };
}

/** Total assets (NAV) managed by the vault: idle cash + venue positions. */
export async function readTotalAssets(client: PublicClient, vaultAddr: Address): Promise<bigint> {
  return client.readContract({ address: vaultAddr, abi: SIBYL_VAULT_ABI, functionName: 'totalAssets' });
}

/** Convert an asset amount to vault shares (floor rounding). */
export async function readConvertToShares(
  client: PublicClient,
  vaultAddr: Address,
  assets: bigint
): Promise<bigint> {
  return client.readContract({
    address: vaultAddr,
    abi: SIBYL_VAULT_ABI,
    functionName: 'convertToShares',
    args: [assets]
  });
}

/** Convert a share amount to underlying assets (floor rounding). */
export async function readConvertToAssets(
  client: PublicClient,
  vaultAddr: Address,
  shares: bigint
): Promise<bigint> {
  return client.readContract({
    address: vaultAddr,
    abi: SIBYL_VAULT_ABI,
    functionName: 'convertToAssets',
    args: [shares]
  });
}

/** Shares minted for `assets` on deposit (floor). */
export async function readPreviewDeposit(
  client: PublicClient,
  vaultAddr: Address,
  assets: bigint
): Promise<bigint> {
  return client.readContract({
    address: vaultAddr,
    abi: SIBYL_VAULT_ABI,
    functionName: 'previewDeposit',
    args: [assets]
  });
}

/**
 * Maximum assets `owner` can withdraw, derived client-side.
 *
 * The on-chain ERC4626 base does not expose `maxWithdraw`, so this returns the
 * assets obtainable by redeeming the owner's entire share balance:
 * previewRedeem(balanceOf(owner)).
 */
export async function readMaxWithdraw(
  client: PublicClient,
  vaultAddr: Address,
  owner: Address
): Promise<bigint> {
  const shares = await client.readContract({
    address: vaultAddr,
    abi: SIBYL_VAULT_ABI,
    functionName: 'balanceOf',
    args: [owner]
  });
  if (shares === 0n) return 0n;
  return client.readContract({
    address: vaultAddr,
    abi: SIBYL_VAULT_ABI,
    functionName: 'previewRedeem',
    args: [shares]
  });
}

/** Current recorded venue position notional for `marketId`. */
export async function readPositionValue(
  client: PublicClient,
  venueAddr: Address,
  marketId: `0x${string}`
): Promise<bigint> {
  return client.readContract({
    address: venueAddr,
    abi: EXECUTION_VENUE_ABI,
    functionName: 'positionValue',
    args: [marketId]
  });
}

export type VaultPosition = { marketId: `0x${string}`; value: bigint };

export type VaultNav = {
  totalAssets: bigint;
  cash: bigint;
  positions: VaultPosition[];
};

/**
 * Read a NAV breakdown for the vault: total assets, idle cash, and per-market
 * venue position values.
 *
 * NAV invariant (mirrors {SibylVault.totalAssets}): totalAssets == cash + sum(positions.value).
 * The vault's configured-market set is private on-chain, so pass the markets to
 * value via `marketIds` (e.g. from the ledger's getMarkets()). When omitted, only
 * idle cash is reported and positions is empty.
 */
export async function readVaultNav(
  client: PublicClient,
  vaultAddr: Address,
  marketIds: readonly `0x${string}`[] = []
): Promise<VaultNav> {
  const [assetAddr, venueAddr, totalAssets] = await Promise.all([
    client.readContract({ address: vaultAddr, abi: SIBYL_VAULT_ABI, functionName: 'asset' }),
    client.readContract({ address: vaultAddr, abi: SIBYL_VAULT_ABI, functionName: 'venue' }),
    client.readContract({ address: vaultAddr, abi: SIBYL_VAULT_ABI, functionName: 'totalAssets' })
  ]);

  const cash = await client.readContract({
    address: assetAddr,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [vaultAddr]
  });

  const positions: VaultPosition[] = await Promise.all(
    marketIds.map(async (marketId) => ({
      marketId,
      value: await readPositionValue(client, venueAddr, marketId)
    }))
  );

  return { totalAssets, cash, positions };
}
