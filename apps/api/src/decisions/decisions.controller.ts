import { Controller, Get } from '@nestjs/common';
import { readTradeArtifacts } from '../lib/artifacts.js';

/** A consensus decision (round outcome) surfaced to the dashboard. */
type Decision = {
  id: string;
  timestamp: number;
  symbol: string;
  direction: string;
  sizeBps: number;
  confidence: number;
  contributors: number;
  txHash?: string;
};

@Controller('decisions')
export class DecisionsController {
  @Get()
  list(): Decision[] {
    // Source of truth: data/artifacts/trade-events.json. Newest first.
    return readTradeArtifacts()
      .map((t) => ({
        id: t.id,
        timestamp: t.timestamp,
        symbol: t.symbol,
        direction: t.direction,
        sizeBps: t.sizeBps,
        confidence: t.confidence,
        contributors: t.contributors.length
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
  }
}
