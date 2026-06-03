import { parseAbi, type Address } from 'viem';

/**
 * Deployed Sibyl protocol addresses on Mantle Sepolia (chain id 5003).
 */
export const SIBYL_VAULT_ADDRESS = '0x62c494cca2df8fF04960d2A73CB723D862554916' as Address;
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
 *
 * Reused as-is for the YES/NO {OutcomeToken}s (standard ERC-20s): the prediction
 * SELL flow needs an outcome-token `approve` to the FPMM, and the UI reads
 * outcome-token balances with the same `balanceOf`.
 */
export const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
]);

/*//////////////////////////////////////////////////////////////
                    PREDICTION MARKETS (Vertical #2)
//////////////////////////////////////////////////////////////*/

/**
 * LIVE Sibyl prediction-market addresses on Mantle Sepolia (chain id 5003).
 * Mirrors `@sibyl/sdk` (packages/sdk/src/predictionMarket.ts) — duplicated as
 * plain consts so the web wallet layer never imports the SDK's node build.
 */
/** Gnosis-CTF-style binary market factory + lifecycle controller. */
export const SIBYL_PREDICTION_MARKET_ADDRESS =
  '0x23960EE69b04e9DC87AE3D5E1e7799c6028edc16' as Address;
/** Permissionless one-tx create+seed launcher (createAndSeed / fpmmOf / allMarketIds). */
export const PREDICTION_FACTORY_ADDRESS =
  '0xfCf5180c83E1A753eaFf489508154430354A7682' as Address;

/** Sample market "MNT-ABOVE-1.5-2026Q3" — marketId hash + its FPMM pool. */
export const SAMPLE_PREDICTION_MARKET_ID =
  '0x25f3d389d2f25bd0aed5c07be0e79acf37adf0ab566b57ed9b1f57db6915e73c' as Address;
export const SAMPLE_OUTCOME_FPMM_ADDRESS =
  '0xF7b95Abe45fa313ac76F572C5C6563BAFd6C2287' as Address;

/**
 * Resolution / trade outcome codes, as encoded on-chain (uint8). Mirrors the
 * SDK `OUTCOME` enum so the YES/NO/INVALID codes match the contract exactly.
 */
export const OUTCOME = {
  UNRESOLVED: 0,
  YES: 1,
  NO: 2,
  INVALID: 3
} as const;

/** Human labels indexed by the on-chain outcome code. */
export const OUTCOME_LABELS = ['UNRESOLVED', 'YES', 'NO', 'INVALID'] as const;

/**
 * OutcomeFPMM ABI subset — fixed-product market maker for one binary market.
 * Mirrors `OUTCOME_FPMM_ABI` from the SDK. YES price equals implied probability
 * (scaled by 1e18). `buy`/`sell`/`calcBuyAmount` take the uint8 outcome code.
 */
export const OUTCOME_FPMM_ABI = parseAbi([
  'function priceYES() view returns (uint256)',
  'function priceNO() view returns (uint256)',
  'function reserveYES() view returns (uint256)',
  'function reserveNO() view returns (uint256)',
  'function calcBuyAmount(uint8 outcome, uint256 collateralIn) view returns (uint256)',
  'function calcSellAmount(uint8 outcome, uint256 collateralOut) view returns (uint256)',
  'function yes() view returns (address)',
  'function no() view returns (address)',
  'function buy(uint8 outcome, uint256 collateralIn, uint256 minOutcomeOut) returns (uint256)',
  'function sell(uint8 outcome, uint256 collateralOut, uint256 maxOutcomeIn) returns (uint256)'
]);

/**
 * SibylPredictionMarket ABI subset — complete-set mint/redeem + resolver-gated
 * resolution + post-resolution redeem. Mirrors `SIBYL_PREDICTION_MARKET_ABI`
 * from the SDK.
 */
export const SIBYL_PREDICTION_MARKET_ABI = parseAbi([
  'function markets(bytes32 marketId) view returns (address collateral, address yes, address no, bytes32 questionHash, uint64 resolveTime, address resolver, uint8 outcome, bool resolved, bool exists)',
  'function mintSet(bytes32 marketId, uint256 amount)',
  'function redeemSet(bytes32 marketId, uint256 amount)',
  'function resolve(bytes32 marketId, uint8 outcome)',
  'function redeem(bytes32 marketId)'
]);

/**
 * PredictionFactory ABI subset — permissionless one-tx launch + registry views.
 * Mirrors the factory write/view surface for completeness.
 */
export const PREDICTION_FACTORY_ABI = parseAbi([
  'function createAndSeed(bytes32 marketId, address collateral, bytes32 questionHash, uint64 resolveTime, address resolver, uint256 seedCollateral) returns (address fpmm)',
  'function fpmmOf(bytes32 marketId) view returns (address)',
  'function allMarketIds(uint256 index) view returns (bytes32)',
  'function allMarketIdsCount() view returns (uint256)'
]);
