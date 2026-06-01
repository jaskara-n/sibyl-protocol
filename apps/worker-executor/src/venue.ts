import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/// A consensus decision turned into an executable order.
export interface ExecutionOrder {
  id: string;
  timestamp: number;
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'FLAT';
  sizeBps: number;
  confidence: number;
  contributors: string[];
}

export interface ExecutionReceipt {
  venue: string;
  status: 'filled' | 'skipped' | 'failed';
  ref: string;
  detail?: string;
}

/// Pluggable execution venue. Lets the consensus engine stay venue-agnostic so we can swap
/// the paper venue for a real spot-DEX adapter (Byreal/RealClaw) without touching the core loop.
export interface IExecutionVenue {
  readonly name: string;
  execute(order: ExecutionOrder): Promise<ExecutionReceipt>;
}

const ARTIFACT_DIR = resolve(process.cwd(), '../../data/artifacts');

/// Default venue: records a bounded paper trade to the artifacts feed. No real funds, no leverage.
export class PaperVenue implements IExecutionVenue {
  readonly name = 'paper';

  async execute(order: ExecutionOrder): Promise<ExecutionReceipt> {
    if (order.direction === 'FLAT' || order.sizeBps === 0) {
      return { venue: this.name, status: 'skipped', ref: order.id, detail: 'no edge (FLAT / zero size)' };
    }
    const tradesPath = resolve(ARTIFACT_DIR, 'trade-events.json');
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    const existing: unknown[] = existsSync(tradesPath)
      ? (JSON.parse(readFileSync(tradesPath, 'utf8')) as unknown[])
      : [];
    existing.unshift({ ...order, mode: 'paper' });
    writeFileSync(tradesPath, JSON.stringify(existing.slice(0, 100), null, 2));
    return { venue: this.name, status: 'filled', ref: order.id };
  }
}

/// Spot-DEX execution via Byreal Skills CLI / RealClaw on Mantle (Merchant Moe / Agni / Fluxion).
/// Verified scope: SPOT only — derivatives live off-chain on Bybit's API and are out of the core loop.
/// The RealClaw API/CLI spec is gated behind hackathon docs; the real call is wired here once available.
export class ByrealSpotVenue implements IExecutionVenue {
  readonly name = 'byreal-spot';

  constructor(private readonly endpoint?: string) {}

  async execute(order: ExecutionOrder): Promise<ExecutionReceipt> {
    if (!this.endpoint) {
      return {
        venue: this.name,
        status: 'skipped',
        ref: order.id,
        detail: 'BYREAL_ENDPOINT not set — RealClaw spot adapter pending the Byreal Skills CLI spec'
      };
    }
    // TODO(byreal): POST a bounded spot order to the RealClaw endpoint. Spot only; never leverage.
    throw new Error('ByrealSpotVenue.execute not implemented: awaiting Byreal Skills CLI / RealClaw API spec');
  }
}

/// Select the venue from EXECUTION_VENUE (default: paper).
export function selectVenue(): IExecutionVenue {
  const mode = (process.env.EXECUTION_VENUE ?? 'paper').toLowerCase();
  if (mode === 'byreal' || mode === 'byreal-spot') {
    return new ByrealSpotVenue(process.env.BYREAL_ENDPOINT);
  }
  return new PaperVenue();
}
