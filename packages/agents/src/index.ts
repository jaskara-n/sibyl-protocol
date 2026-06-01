import type { Direction, Signal } from '@sibyl/shared';

export interface AgentInput {
  symbol: string;
  timestamp: number;
  price: number;
  fundingRate: number;
  oiDelta: number;
  momentum: number;
  newsSentiment: number;
}

export interface SignalAgent {
  id: string;
  run(input: AgentInput): Promise<Signal>;
}

function normalize(value: number, floor = 0.35, ceil = 0.75): number {
  const clamped = Math.max(-1, Math.min(1, value));
  return floor + ((clamped + 1) / 2) * (ceil - floor);
}

function directionFromScore(score: number): Direction {
  if (score > 0.08) return 'LONG';
  if (score < -0.08) return 'SHORT';
  return 'FLAT';
}

export class NewsAgent implements SignalAgent {
  id = 'news_v1';

  async run(input: AgentInput): Promise<Signal> {
    const score = input.newsSentiment;
    return {
      agentId: this.id,
      timestamp: input.timestamp,
      symbol: input.symbol,
      direction: directionFromScore(score),
      probability: normalize(score)
    };
  }
}

export class FundingAgent implements SignalAgent {
  id = 'funding_v1';

  async run(input: AgentInput): Promise<Signal> {
    const score = -input.fundingRate * 20;
    return {
      agentId: this.id,
      timestamp: input.timestamp,
      symbol: input.symbol,
      direction: directionFromScore(score),
      probability: normalize(score)
    };
  }
}

export class OnchainOiAgent implements SignalAgent {
  id = 'onchain_oi_v1';

  async run(input: AgentInput): Promise<Signal> {
    const score = input.oiDelta;
    return {
      agentId: this.id,
      timestamp: input.timestamp,
      symbol: input.symbol,
      direction: directionFromScore(score),
      probability: normalize(score)
    };
  }
}

export class MomentumAgent implements SignalAgent {
  id = 'momentum_v1';

  async run(input: AgentInput): Promise<Signal> {
    const score = input.momentum;
    return {
      agentId: this.id,
      timestamp: input.timestamp,
      symbol: input.symbol,
      direction: directionFromScore(score),
      probability: normalize(score)
    };
  }
}

export class RogueLeverageAgent implements SignalAgent {
  id = 'rogue_10x_v1';

  async run(input: AgentInput): Promise<Signal> {
    const oscillation = Math.sin(input.timestamp / 1800);
    const score = oscillation > 0 ? 1 : -1;
    return {
      agentId: this.id,
      timestamp: input.timestamp,
      symbol: input.symbol,
      direction: score > 0 ? 'LONG' : 'SHORT',
      probability: 0.95
    };
  }
}

export const DEFAULT_AGENTS: SignalAgent[] = [
  new NewsAgent(),
  new FundingAgent(),
  new OnchainOiAgent(),
  new MomentumAgent(),
  new RogueLeverageAgent()
];
