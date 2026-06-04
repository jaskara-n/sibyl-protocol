import { Controller, Get, Param } from '@nestjs/common';
import { readTradeArtifacts, defaultMarketId, type TradeArtifact } from '../lib/artifacts.js';

/** The latest consensus decision shaped for the dashboard. */
type LatestConsensus = {
  marketId: string;
  direction: string;
  sizeBps: number;
  confidence: number;
  contributors: string[];
  source: string;
  timestamp?: number;
};

/// Newest decision for a market (or any market when marketId is omitted). Source of truth:
/// data/artifacts/trade-events.json, each event carrying its marketId.
function latestFor(marketId?: string): LatestConsensus {
  const trades = readTradeArtifacts()
    .filter((t) => marketId === undefined || t.marketId === marketId)
    .sort((a, b) => b.timestamp - a.timestamp);

  if (trades.length === 0) {
    return {
      marketId: marketId ?? defaultMarketId(),
      direction: 'FLAT',
      sizeBps: 0,
      confidence: 0.5,
      contributors: [],
      source: 'no-trades-yet'
    };
  }

  const latest = trades[0] as TradeArtifact;
  return {
    marketId: latest.marketId,
    direction: latest.direction,
    sizeBps: latest.sizeBps,
    confidence: latest.confidence,
    contributors: latest.contributors,
    source: latest.id,
    timestamp: latest.timestamp
  };
}

@Controller('consensus')
export class ConsensusController {
  /// Legacy market-blind alias: the latest consensus for the default market. Kept for
  /// back-compat with clients that predate the multi-market endpoints.
  @Get('latest')
  latest(): LatestConsensus {
    return latestFor(defaultMarketId());
  }

  /// GET /consensus/:marketId/latest — the latest consensus decision for one market.
  @Get(':marketId/latest')
  latestForMarket(@Param('marketId') marketId: string): LatestConsensus {
    return latestFor(marketId);
  }
}
