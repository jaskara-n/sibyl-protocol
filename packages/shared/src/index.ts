export type Direction = 'LONG' | 'SHORT' | 'FLAT';

export interface Signal {
  agentId: string;
  timestamp: number;
  symbol: string;
  direction: Direction;
  probability: number;
}

export interface ReplayScore {
  agentId: string;
  brier: number;
}

export interface ConsensusResult {
  direction: Direction;
  confidence: number;
  sizeBps: number;
  contributors: string[];
}

/*//////////////////////////////////////////////////////////////
              CANONICAL CONSENSUS (integer ppm domain)

  This is the off-chain mirror of `SibylConsensusLib.sol`. Both implement the
  SAME algorithm in integer parts-per-million (1_000_000 == 1.0). The frozen
  golden vectors in packages/contracts/test/fixtures/consensus-vectors.json are
  asserted by both the Solidity parity test and the TS parity test, so any
  divergence is a CI failure. Do not "optimize" one side without the other.
//////////////////////////////////////////////////////////////*/

export const ONE_PPM = 1_000_000n;
export const HALF_PPM = 500_000n;
export const FLAT_LOWER_PPM = 495_000n;
export const FLAT_UPPER_PPM = 505_000n;
export const MAX_SIZE_BPS = 2_000n;
export const SIZE_DIVISOR = 250n;

/// Default per-agent weight cap (ppm). MUST match SibylLedger.DEFAULT_MAX_AGENT_WEIGHT_PPM.
/// Chosen so it does not bind for realistic Briers (preserving the reputation gradient) while
/// still clamping a near-perfect / gaming agent (Brier < 0.1) from fully dominating.
export const DEFAULT_MAX_AGENT_WEIGHT_PPM = 900_000;

/// FLAT = 0, LONG = 1, SHORT = 2 (matches the on-chain Direction enum).
export type DirectionCode = 0 | 1 | 2;

export interface ConsensusResultPpm {
  direction: DirectionCode;
  sizeBps: number;
  confidencePpm: number;
  contributorCount: number;
}

export function brierScore(probability: number, outcome: 0 | 1): number {
  const diff = probability - outcome;
  return diff * diff;
}

/// The single float -> ppm conversion boundary (round-half-up), clamped to [0, 1].
export function toPpm(value: number): number {
  if (Number.isNaN(value)) return 500_000;
  const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
  return Math.round(clamped * 1_000_000);
}

/// Inverse-Brier weight in ppm: (1e6 - min(brier,1e6)) + 1. Range [1, 1_000_001].
export function weightPpm(brierPpm: number): bigint {
  let b = BigInt(Math.trunc(brierPpm));
  if (b > ONE_PPM) b = ONE_PPM;
  if (b < 0n) b = 0n;
  return ONE_PPM - b + 1n;
}

/// Canonical consensus over parallel ppm arrays. Mirrors SibylConsensusLib.compute exactly.
export function computeConsensusPpm(
  brierPpm: number[],
  isLong: boolean[],
  probabilityPpm: number[],
  maxAgentWeightPpm: number = DEFAULT_MAX_AGENT_WEIGHT_PPM
): ConsensusResultPpm {
  const n = brierPpm.length;
  if (n === 0) {
    return { direction: 0, sizeBps: 0, confidencePpm: 500_000, contributorCount: 0 };
  }

  const cap = BigInt(maxAgentWeightPpm);
  let weightedLong = 0n;
  let totalWeight = 0n;
  for (let i = 0; i < n; i++) {
    let w = weightPpm(brierPpm[i]);
    if (w > cap) w = cap;
    const p = BigInt(probabilityPpm[i]);
    const longProbPpm = isLong[i] ? p : ONE_PPM - p;
    weightedLong += w * longProbPpm;
    totalWeight += w * ONE_PPM;
  }

  if (totalWeight === 0n) {
    return { direction: 0, sizeBps: 0, confidencePpm: 500_000, contributorCount: 0 };
  }

  const confidencePpm = (weightedLong * ONE_PPM) / totalWeight;

  let direction: DirectionCode;
  if (confidencePpm > FLAT_UPPER_PPM) direction = 1;
  else if (confidencePpm < FLAT_LOWER_PPM) direction = 2;
  else direction = 0;

  const edge = confidencePpm >= HALF_PPM ? confidencePpm - HALF_PPM : HALF_PPM - confidencePpm;
  let size = (edge + 125n) / SIZE_DIVISOR;
  if (size > MAX_SIZE_BPS) size = MAX_SIZE_BPS;
  if (direction === 0) size = 0n;

  return {
    direction,
    sizeBps: Number(size),
    confidencePpm: Number(confidencePpm),
    contributorCount: n
  };
}

const DIRECTION_BY_CODE: Record<DirectionCode, Direction> = { 0: 'FLAT', 1: 'LONG', 2: 'SHORT' };

/// Display-friendly wrapper over {@link computeConsensusPpm}. Recognized signals are mapped into
/// the ppm domain (SHORT side inverts), then the canonical integer algorithm decides everything.
export function computeConsensus(
  signals: Signal[],
  scores: ReplayScore[],
  maxAgentWeightPpm: number = DEFAULT_MAX_AGENT_WEIGHT_PPM
): ConsensusResult {
  const brierByAgent = new Map(scores.map((s) => [s.agentId, s.brier]));

  const brierPpm: number[] = [];
  const isLong: boolean[] = [];
  const probabilityPpm: number[] = [];
  const contributors: string[] = [];

  for (const signal of signals) {
    const brier = brierByAgent.get(signal.agentId);
    if (brier === undefined) continue;
    brierPpm.push(toPpm(brier));
    isLong.push(signal.direction !== 'SHORT');
    probabilityPpm.push(toPpm(signal.probability));
    contributors.push(signal.agentId);
  }

  const result = computeConsensusPpm(brierPpm, isLong, probabilityPpm, maxAgentWeightPpm);

  return {
    direction: DIRECTION_BY_CODE[result.direction],
    confidence: result.confidencePpm / 1_000_000,
    sizeBps: result.sizeBps,
    contributors: result.contributorCount === 0 ? [] : contributors
  };
}
