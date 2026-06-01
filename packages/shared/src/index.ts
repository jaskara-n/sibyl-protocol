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

export function brierScore(probability: number, outcome: 0 | 1): number {
  const diff = probability - outcome;
  return diff * diff;
}

function clampProbability(value: number): number {
  if (Number.isNaN(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function weightFromBrier(brier: number): number {
  const safe = Math.max(0, Math.min(1, brier));
  return (1 - safe) + 0.000001;
}

export function computeConsensus(signals: Signal[], scores: ReplayScore[]): ConsensusResult {
  if (signals.length === 0) {
    return { direction: 'FLAT', confidence: 0.5, sizeBps: 0, contributors: [] };
  }

  const scoreByAgent = new Map(scores.map((s) => [s.agentId, s.brier]));
  let weightedLong = 0;
  let totalWeight = 0;
  const contributors: string[] = [];

  for (const signal of signals) {
    const brier = scoreByAgent.get(signal.agentId);
    if (brier === undefined) continue;

    const weight = weightFromBrier(brier);
    const prob = clampProbability(signal.probability);
    const longProbability = signal.direction === 'SHORT' ? 1 - prob : prob;

    weightedLong += longProbability * weight;
    totalWeight += weight;
    contributors.push(signal.agentId);
  }

  if (totalWeight === 0) {
    return { direction: 'FLAT', confidence: 0.5, sizeBps: 0, contributors: [] };
  }

  const confidence = weightedLong / totalWeight;
  const direction: Direction = confidence > 0.505 ? 'LONG' : confidence < 0.495 ? 'SHORT' : 'FLAT';
  const edge = Math.abs(confidence - 0.5) * 2;
  const sizeBps = direction === 'FLAT' ? 0 : Math.min(2000, Math.round(edge * 2000));

  return { direction, confidence, sizeBps, contributors };
}
