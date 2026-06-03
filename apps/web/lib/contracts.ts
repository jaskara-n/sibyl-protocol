import { parseAbi, type Address } from 'viem';

/**
 * Deployed Sibyl protocol addresses on Mantle Sepolia (chain id 5003).
 */
export const SIBYL_VAULT_ADDRESS = '0x88DF879F8AA796F0e2859BDfb255A143d5b2EffF' as Address;
/** Base asset of the vault: sUSD (18 decimals). */
export const SUSD_ADDRESS = '0x6f5BdBe611aE3c84153BD9d2216ce076C2FBba18' as Address;
export const SUSD_DECIMALS = 18;

/**
 * SibylVault ERC-4626 ABI (read subset) — mirrors `SIBYL_VAULT_ABI` from
 * `@sibyl/sdk` (packages/sdk/src/sibylVault.ts). Duplicated here as a plain
 * viem `parseAbi` so the web wallet layer does not pull in the SDK's
 * node-oriented build at bundle time. Keep in sync with the SDK source.
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
  'function feeRecipient() view returns (address)',
  // --- write surface (ERC-4626 base) ---
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
  'function mint(uint256 shares, address receiver) returns (uint256 assets)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)'
]);

/**
 * Minimal ERC-20 ABI for the sUSD base asset: balance + allowance reads and the
 * approve write needed before a vault deposit.
 */
export const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
]);
