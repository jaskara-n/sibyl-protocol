import type { Direction, Signal } from '@sibyl/shared';

export interface AgentInput {
  symbol: string;
  timestamp: number;
}

export interface SignalAgent {
  id: string;
  run(input: AgentInput): Promise<Signal>;
}

export class MomentumAgent implements SignalAgent {
  id = 'momentum_v1';

  async run(input: AgentInput): Promise<Signal> {
    const direction: Direction = 'FLAT';
    return {
      agentId: this.id,
      timestamp: input.timestamp,
      symbol: input.symbol,
      direction,
      probability: 0.5
    };
  }
}
