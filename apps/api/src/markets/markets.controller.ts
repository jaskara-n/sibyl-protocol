import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { keccak256, toBytes } from 'viem';
import { weightPpm, toPpm, DEFAULT_MAX_AGENT_WEIGHT_PPM } from '@sibyl/shared';
import type { ReplayScore } from '@sibyl/shared';
import { listMarkets, readReplayArtifact, scoresForMarket } from '../lib/artifacts.js';

/// The reputation-weighted conviction index for a market, computed off-chain from the
/// per-market replay scores. Mirrors the on-chain `convictionIndex(marketId)` view:
/// `totalWeight` is the sum of each active agent's CAPPED inverse-Brier weight (ppm) and
/// `activeAgentCount` is the number of agents scored on that market.
type ConvictionIndex = {
  marketId: string;
  marketIdHex: `0x${string}`;
  totalWeight: string;
  activeAgentCount: number;
};

type MarketSummary = {
  marketId: string;
  marketIdHex: `0x${string}`;
  active: boolean;
  convictionIndex: ConvictionIndex;
};

/// marketId on-chain is bytes32 == keccak256(symbol) — the same derivation the replay
/// payload and executor use.
function toMarketIdHex(symbol: string): `0x${string}` {
  return keccak256(toBytes(symbol));
}

/// Conviction index for one market: summed capped agent weight + active agent count.
/// Computed purely from per-market replay scores (no chain / deployment required), so the
/// paper dry-run works fully offline.
function convictionFor(marketId: string, scores: ReplayScore[]): ConvictionIndex {
  const cap = BigInt(DEFAULT_MAX_AGENT_WEIGHT_PPM);
  let totalWeight = 0n;
  for (const score of scores) {
    const raw = weightPpm(toPpm(score.brier));
    totalWeight += raw > cap ? cap : raw;
  }
  return {
    marketId,
    marketIdHex: toMarketIdHex(marketId),
    totalWeight: totalWeight.toString(),
    activeAgentCount: scores.length
  };
}

@Controller('markets')
export class MarketsController {
  /// GET /markets — registered markets, their active flag, and per-market convictionIndex
  /// derived from the per-market replay scores.
  @Get()
  list(): MarketSummary[] {
    const replay = readReplayArtifact();
    return listMarkets().map((marketId) => ({
      marketId,
      marketIdHex: toMarketIdHex(marketId),
      // Every registered market in the demo set is active (paper dry-run / offline default).
      active: true,
      convictionIndex: convictionFor(marketId, replay ? scoresForMarket(replay, marketId) : [])
    }));
  }

  /// GET /markets/:marketId/conviction — conviction index for a single market.
  @Get(':marketId/conviction')
  conviction(@Param('marketId') marketId: string): ConvictionIndex {
    const markets = listMarkets();
    if (!markets.includes(marketId)) {
      throw new NotFoundException(`Unknown market: ${marketId}`);
    }
    const replay = readReplayArtifact();
    return convictionFor(marketId, replay ? scoresForMarket(replay, marketId) : []);
  }
}
