import { Controller, Get, Param } from '@nestjs/common';
import {
  readTradeArtifacts,
  readDeployedConsensus,
  defaultMarketId,
  type TradeArtifact
} from '../lib/artifacts.js';

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

/// Newest consensus decision for a market. Resolution order, most-canonical first:
///   1. the on-chain ConsensusReached record (deployments/mantle-sepolia.json) — matches
///      the Mantle explorer and is always committed, so the dashboard is never empty;
///   2. the recorded trade-events.json log, if present (paper-trade history);
///   3. FLAT, only when a market genuinely has no recorded consensus.
function latestFor(marketId?: string): LatestConsensus {
  const mid = marketId ?? defaultMarketId();

  // 1) Canonical on-chain record.
  const onchain = readDeployedConsensus(mid);
  if (onchain) {
    return {
      marketId: onchain.marketId,
      direction: onchain.direction,
      sizeBps: onchain.sizeBps,
      confidence: onchain.confidence,
      contributors: onchain.contributors,
      source: onchain.tx ? `onchain:${onchain.tx.slice(0, 10)}` : 'onchain'
    };
  }

  // 2) Recorded trade log.
  const trades = readTradeArtifacts()
    .filter((t) => marketId === undefined || t.marketId === marketId)
    .sort((a, b) => b.timestamp - a.timestamp);
  if (trades.length > 0) {
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

  // 3) Genuinely no consensus yet.
  return {
    marketId: mid,
    direction: 'FLAT',
    sizeBps: 0,
    confidence: 0.5,
    contributors: [],
    source: 'no-consensus-yet'
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
