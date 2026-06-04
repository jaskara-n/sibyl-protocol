import { Controller, Get, Query } from '@nestjs/common';
import { readTradeArtifacts } from '../lib/artifacts.js';

/** A consensus decision (round outcome) surfaced to the dashboard. */
type Decision = {
  id: string;
  marketId: string;
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
  /// GET /decisions[?marketId=] — consensus decisions, newest first, optionally scoped to a
  /// single market. Source of truth: data/artifacts/trade-events.json.
  @Get()
  list(@Query('marketId') marketId?: string): Decision[] {
    return readTradeArtifacts()
      .filter((t) => marketId === undefined || t.marketId === marketId)
      .map((t) => ({
        id: t.id,
        marketId: t.marketId,
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
