import { Controller, Get, Query } from '@nestjs/common';
import { readTradeArtifacts, readAllDeployedConsensus } from '../lib/artifacts.js';

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
    // Off-chain replay archive (paper decisions, no tx).
    const paper: Decision[] = readTradeArtifacts()
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
      }));

    // Canonical on-chain ConsensusReached records (carry a Mantle tx). Stamped just
    // after the archive so they surface as the newest, on-chain decisions.
    const baseTs = paper.reduce((m, p) => Math.max(m, p.timestamp), 0) || Math.floor(Date.now() / 1000);
    const onchain: Decision[] = readAllDeployedConsensus()
      .filter((c) => marketId === undefined || c.marketId === marketId)
      .map((c, i) => ({
        id: `onchain-${c.marketId}-${(c.tx ?? '').slice(2, 10)}`,
        marketId: c.marketId,
        timestamp: baseTs + i + 1,
        symbol: c.marketId,
        direction: c.direction,
        sizeBps: c.sizeBps,
        confidence: c.confidence,
        contributors: c.contributors.length,
        txHash: c.tx
      }));

    return [...onchain, ...paper].sort((a, b) => b.timestamp - a.timestamp);
  }
}
