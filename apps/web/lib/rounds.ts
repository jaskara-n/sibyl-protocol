export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export type LivePrediction = {
  agentId: string;
  direction: 'LONG' | 'SHORT' | 'FLAT';
  probability: number;
  pUp: number;
};

export type LiveResult = {
  agentId: string;
  pUp: number;
  brierDelta: number;
  correct: boolean;
  liveBrier: number;
};

export type LiveConsensus = {
  direction: 'LONG' | 'SHORT' | 'FLAT';
  sizeBps: number;
  confidence: number;
  contributorCount: number;
};

export type LiveRound = {
  id: number;
  market: string;
  openedAt: number;
  closesAt: number;
  openPrice: number;
  predictions: LivePrediction[];
  consensus: LiveConsensus;
  closePrice?: number;
  outcome?: 0 | 1;
  resolvedAt?: number;
  consensusCorrect?: boolean;
  results?: LiveResult[];
};

export type LiveReputation = {
  agentId: string;
  liveBrier: number;
  rounds: number;
  isRogue: boolean;
};

export type RoundEvent = {
  type: 'round_open' | 'round_resolved';
  market: string;
  round: LiveRound;
  reputation: LiveReputation[];
};

export type RoundsState = {
  roundSeconds: number;
  markets: {
    market: string;
    current: LiveRound | null;
    reputation: LiveReputation[];
    history: LiveRound[];
  }[];
};
