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

export function brierScore(probability: number, outcome: 0 | 1): number {
  const diff = probability - outcome;
  return diff * diff;
}
