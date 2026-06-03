import { parseAbi, type Address, type Hex } from 'viem';
import { mantleClient } from './index.js';

/**
 * Sibyl prediction-market SDK surface.
 *
 * Mirrors the conventions in {@link ./sibylVault.ts} and {@link ./sibylLedger.ts}:
 * a `parseAbi` ABI, exported deployed addresses, READ helpers bound to the
 * shared {@link mantleClient}, and pure WRITE-BUILDER objects
 * ({ address, abi, functionName, args }) ready to hand to a wallet/wagmi
 * `writeContract` call.
 *
 * Surfaces are derived from
 * packages/contracts/src/prediction/SibylPredictionMarket.sol and OutcomeFPMM.sol.
 *
 * SibylPredictionMarket is the Gnosis-CTF-style binary market factory and
 * lifecycle controller (complete-set mint/redeem, resolver-gated resolution).
 * OutcomeFPMM is the fixed-product market maker for one market where the YES
 * price equals the implied probability (scaled by 1e18).
 */

/*//////////////////////////////////////////////////////////////
                            ADDRESSES
//////////////////////////////////////////////////////////////*/

/// LIVE SibylPredictionMarket on Mantle Sepolia (chain 5003).
export const SIBYL_PREDICTION_MARKET_ADDRESS =
  '0x23960EE69b04e9DC87AE3D5E1e7799c6028edc16' as const;

/// LIVE sample OutcomeFPMM (market "MNT-ABOVE-1.5-2026Q3") on Mantle Sepolia.
export const OUTCOME_FPMM_ADDRESS =
  '0xF7b95Abe45fa313ac76F572C5C6563BAFd6C2287' as const;

/// Sample prediction marketId hash for "MNT-ABOVE-1.5-2026Q3".
export const SAMPLE_PREDICTION_MARKET_ID =
  '0x25f3d389d2f25bd0aed5c07be0e79acf37adf0ab566b57ed9b1f57db6915e73c' as const;

/*//////////////////////////////////////////////////////////////
                              OUTCOMES
//////////////////////////////////////////////////////////////*/

/// Resolution / trade outcome codes, as encoded on-chain (uint8).
export const OUTCOME = {
  UNRESOLVED: 0,
  YES: 1,
  NO: 2,
  INVALID: 3
} as const;

/// Human labels indexed by the on-chain outcome code.
export const OUTCOME_LABELS = ['UNRESOLVED', 'YES', 'NO', 'INVALID'] as const;

/*//////////////////////////////////////////////////////////////
                                ABIs
//////////////////////////////////////////////////////////////*/

/// SibylPredictionMarket ABI surface (factory + lifecycle subset + events).
export const SIBYL_PREDICTION_MARKET_ABI = parseAbi([
  'function markets(bytes32 marketId) view returns (address collateral, address yes, address no, bytes32 questionHash, uint64 resolveTime, address resolver, uint8 outcome, bool resolved, bool exists)',
  'function createMarket(bytes32 marketId, address collateral, bytes32 questionHash, uint64 resolveTime, address resolver)',
  'function mintSet(bytes32 marketId, uint256 amount)',
  'function redeemSet(bytes32 marketId, uint256 amount)',
  'function resolve(bytes32 marketId, uint8 outcome)',
  'function redeem(bytes32 marketId)',
  'event MarketCreated(bytes32 indexed marketId, address indexed collateral, address indexed resolver, address yes, address no, bytes32 questionHash, uint64 resolveTime)',
  'event Resolved(bytes32 indexed marketId, uint8 outcome)'
]);

/// OutcomeFPMM ABI surface (price/reserve reads + buy/sell + funding).
export const OUTCOME_FPMM_ABI = parseAbi([
  'function priceYES() view returns (uint256)',
  'function priceNO() view returns (uint256)',
  'function reserveYES() view returns (uint256)',
  'function reserveNO() view returns (uint256)',
  'function calcBuyAmount(uint8 outcome, uint256 collateralIn) view returns (uint256)',
  'function buy(uint8 outcome, uint256 collateralIn, uint256 minOutcomeOut) returns (uint256)',
  'function sell(uint8 outcome, uint256 collateralOut, uint256 maxOutcomeIn) returns (uint256)',
  'function addFunding(uint256 collateralIn) returns (uint256)',
  'function removeFunding(uint256 lpShares) returns (uint256)'
]);

/*//////////////////////////////////////////////////////////////
                            READ HELPERS
//////////////////////////////////////////////////////////////*/

export type PredictionMarket = {
  collateral: Address;
  yes: Address;
  no: Address;
  questionHash: Hex;
  resolveTime: bigint;
  resolver: Address;
  /// On-chain outcome code: 0=UNRESOLVED, 1=YES, 2=NO, 3=INVALID.
  outcome: number;
  resolved: boolean;
  exists: boolean;
};

/// Read the full market record for `marketId` from the SibylPredictionMarket.
export async function readPredictionMarket(
  marketId: Hex,
  marketAddress: Address = SIBYL_PREDICTION_MARKET_ADDRESS
): Promise<PredictionMarket> {
  const [collateral, yes, no, questionHash, resolveTime, resolver, outcome, resolved, exists] =
    await mantleClient.readContract({
      address: marketAddress,
      abi: SIBYL_PREDICTION_MARKET_ABI,
      functionName: 'markets',
      args: [marketId]
    });
  return {
    collateral,
    yes,
    no,
    questionHash,
    resolveTime,
    resolver,
    outcome: Number(outcome),
    resolved,
    exists
  };
}

export type FpmmState = {
  /// Implied probability of YES, scaled by 1e18 (price(YES) = reserveNO / total).
  priceYesPpmOr1e18: bigint;
  /// Implied probability of NO, scaled by 1e18.
  priceNo: bigint;
  /// Current YES outcome-token reserve held by the pool.
  reserveYes: bigint;
  /// Current NO outcome-token reserve held by the pool.
  reserveNo: bigint;
  /// Convenience: YES probability as a 0..100 percent number.
  priceYesPct: number;
};

/// Read the live price/reserve state of an OutcomeFPMM pool.
export async function readFpmm(fpmmAddress: Address = OUTCOME_FPMM_ADDRESS): Promise<FpmmState> {
  const [priceYes, priceNo, reserveYes, reserveNo] = await Promise.all([
    mantleClient.readContract({ address: fpmmAddress, abi: OUTCOME_FPMM_ABI, functionName: 'priceYES' }),
    mantleClient.readContract({ address: fpmmAddress, abi: OUTCOME_FPMM_ABI, functionName: 'priceNO' }),
    mantleClient.readContract({ address: fpmmAddress, abi: OUTCOME_FPMM_ABI, functionName: 'reserveYES' }),
    mantleClient.readContract({ address: fpmmAddress, abi: OUTCOME_FPMM_ABI, functionName: 'reserveNO' })
  ]);
  return {
    priceYesPpmOr1e18: priceYes,
    priceNo,
    reserveYes,
    reserveNo,
    priceYesPct: Number((priceYes * 10000n) / 10n ** 18n) / 100
  };
}

/// Quote the amount of `outcome` shares received for spending `collateralIn`.
export async function calcBuyAmount(
  fpmmAddress: Address,
  outcome: number,
  collateralIn: bigint
): Promise<bigint> {
  return mantleClient.readContract({
    address: fpmmAddress,
    abi: OUTCOME_FPMM_ABI,
    functionName: 'calcBuyAmount',
    args: [outcome, collateralIn]
  });
}

/*//////////////////////////////////////////////////////////////
                          WRITE BUILDERS
//////////////////////////////////////////////////////////////*/

/// Build a createMarket call for SibylPredictionMarket.
export function buildCreateMarket(params: {
  marketId: Hex;
  collateral: Address;
  questionHash: Hex;
  resolveTime: bigint;
  resolver: Address;
  marketAddress?: Address;
}) {
  return {
    address: params.marketAddress ?? SIBYL_PREDICTION_MARKET_ADDRESS,
    abi: SIBYL_PREDICTION_MARKET_ABI,
    functionName: 'createMarket',
    args: [params.marketId, params.collateral, params.questionHash, params.resolveTime, params.resolver]
  } as const;
}

/// Build a mintSet (deposit collateral -> mint YES+NO complete set) call.
export function buildMintSet(
  marketId: Hex,
  amount: bigint,
  marketAddress: Address = SIBYL_PREDICTION_MARKET_ADDRESS
) {
  return {
    address: marketAddress,
    abi: SIBYL_PREDICTION_MARKET_ABI,
    functionName: 'mintSet',
    args: [marketId, amount]
  } as const;
}

/// Build a redeemSet (burn YES+NO complete set -> return collateral) call.
export function buildRedeemSet(
  marketId: Hex,
  amount: bigint,
  marketAddress: Address = SIBYL_PREDICTION_MARKET_ADDRESS
) {
  return {
    address: marketAddress,
    abi: SIBYL_PREDICTION_MARKET_ABI,
    functionName: 'redeemSet',
    args: [marketId, amount]
  } as const;
}

/// Build a resolve call (resolver-only; outcome must be YES|NO|INVALID).
export function buildResolve(
  marketId: Hex,
  outcome: number,
  marketAddress: Address = SIBYL_PREDICTION_MARKET_ADDRESS
) {
  return {
    address: marketAddress,
    abi: SIBYL_PREDICTION_MARKET_ABI,
    functionName: 'resolve',
    args: [marketId, outcome]
  } as const;
}

/// Build a redeem call (claim payout on winning shares post-resolution).
export function buildRedeem(
  marketId: Hex,
  marketAddress: Address = SIBYL_PREDICTION_MARKET_ADDRESS
) {
  return {
    address: marketAddress,
    abi: SIBYL_PREDICTION_MARKET_ABI,
    functionName: 'redeem',
    args: [marketId]
  } as const;
}

/// Build an FPMM buy call (spend `collateralIn`, receive >= `minOutcomeOut`).
export function buildBuy(params: {
  outcome: number;
  collateralIn: bigint;
  minOutcomeOut: bigint;
  fpmmAddress?: Address;
}) {
  return {
    address: params.fpmmAddress ?? OUTCOME_FPMM_ADDRESS,
    abi: OUTCOME_FPMM_ABI,
    functionName: 'buy',
    args: [params.outcome, params.collateralIn, params.minOutcomeOut]
  } as const;
}

/// Build an FPMM sell call (receive exactly `collateralOut`, spend <= `maxOutcomeIn`).
export function buildSell(params: {
  outcome: number;
  collateralOut: bigint;
  maxOutcomeIn: bigint;
  fpmmAddress?: Address;
}) {
  return {
    address: params.fpmmAddress ?? OUTCOME_FPMM_ADDRESS,
    abi: OUTCOME_FPMM_ABI,
    functionName: 'sell',
    args: [params.outcome, params.collateralOut, params.maxOutcomeIn]
  } as const;
}
