import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { getAddress, keccak256, toBytes } from 'viem';
import { weightPpm, toPpm, DEFAULT_MAX_AGENT_WEIGHT_PPM } from '@sibyl/shared';
import type { ReplayScore } from '@sibyl/shared';
import { getMarkets, isMarketActive, readConvictionIndex, shortHash } from '@sibyl/sdk';
import {
  listMarkets,
  readDeployedLedger,
  readDeployedMarkets,
  readReplayArtifact,
  scoresForMarket
} from '../lib/artifacts.js';

/// The reputation-weighted conviction index for a market. Mirrors the on-chain
/// `convictionIndex(marketId)` view: `totalWeight` is the sum of each active agent's CAPPED
/// inverse-Brier weight (ppm) and `activeAgentCount` is the number of active agents.
type Conviction = {
  totalWeight: string;
  activeAgentCount: number;
};

/// A market on the smart-money map: its symbol, on-chain id hash, active flag and conviction.
type MarketSummary = {
  marketId: string;
  marketIdHex: `0x${string}`;
  active: boolean;
  conviction: Conviction;
};

/// Single-market conviction shape kept for the legacy /markets/:marketId/conviction route.
type ConvictionIndex = {
  marketId: string;
  marketIdHex: `0x${string}`;
  totalWeight: string;
  activeAgentCount: number;
};

/// marketId on-chain is bytes32 == keccak256(symbol) — the same derivation the replay
/// payload and executor use.
function toMarketIdHex(symbol: string): `0x${string}` {
  return keccak256(toBytes(symbol));
}

/// Conviction index for one market, computed purely from per-market replay scores (no chain /
/// deployment required) so the paper dry-run works fully offline. Used by the static fallback.
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

/// Sort markets by conviction totalWeight DESCENDING (highest conviction on top). totalWeight
/// is a stringified uint256, so compare as BigInt to avoid precision loss.
function byConvictionDesc(a: MarketSummary, b: MarketSummary): number {
  const wa = BigInt(a.conviction.totalWeight);
  const wb = BigInt(b.conviction.totalWeight);
  if (wa === wb) return 0;
  return wa > wb ? -1 : 1;
}

@Controller('markets')
export class MarketsController {
  /// GET /markets — the smart-money map: registered markets ranked by Conviction Index
  /// (reputation-weighted agent activity) DESCENDING, highest conviction on top.
  ///
  /// Reads markets + conviction FROM CHAIN (ledger getMarkets() + convictionIndex(marketId)),
  /// labelling each on-chain marketId hash with its symbol from the deployments markets[] list.
  /// Falls back to the offline artifact/static path if the chain read fails.
  @Get()
  async list(): Promise<MarketSummary[]> {
    const deployed = readDeployedLedger();
    const ledgerAddress = process.env.SIBYL_LEDGER_ADDRESS ?? deployed?.address;

    if (ledgerAddress) {
      try {
        return await this.listFromChain(getAddress(ledgerAddress));
      } catch {
        // Fall through to the offline fallback below.
      }
    }
    return this.listFromArtifacts();
  }

  /// Chain-backed market list: ledger getMarkets() hashes -> symbol (via deployments markets[])
  /// + on-chain convictionIndex + active flag, sorted by conviction DESC.
  private async listFromChain(ledgerAddress: `0x${string}`): Promise<MarketSummary[]> {
    const marketIdHexes = await getMarkets(ledgerAddress);
    // Known-symbols list: keccak256(toBytes(symbol)) === marketIdHex. Sourced from the
    // deployments json so a new market only needs a json entry to be labelled.
    const symbolByHex = new Map<string, string>(
      readDeployedMarkets().map((m) => [m.marketIdHex.toLowerCase(), m.marketId])
    );

    const markets = await Promise.all(
      marketIdHexes.map(async (marketIdHex): Promise<MarketSummary> => {
        const hex = marketIdHex.toLowerCase() as `0x${string}`;
        const [conviction, active] = await Promise.all([
          readConvictionIndex(ledgerAddress, marketIdHex),
          isMarketActive(ledgerAddress, marketIdHex)
        ]);
        return {
          // Label unknown hashes by short hash so the map still renders.
          marketId: symbolByHex.get(hex) ?? shortHash(marketIdHex),
          marketIdHex,
          active,
          conviction: {
            totalWeight: conviction.totalWeight.toString(),
            activeAgentCount: conviction.activeAgentCount
          }
        };
      })
    );

    return markets.sort(byConvictionDesc);
  }

  /// Offline fallback: markets + conviction derived from the replay artifact / static config,
  /// still ranked by conviction DESC so the smart-money map ordering is consistent.
  private listFromArtifacts(): MarketSummary[] {
    const replay = readReplayArtifact();
    return listMarkets()
      .map((marketId): MarketSummary => {
        const c = convictionFor(marketId, replay ? scoresForMarket(replay, marketId) : []);
        return {
          marketId,
          marketIdHex: c.marketIdHex,
          active: true,
          conviction: { totalWeight: c.totalWeight, activeAgentCount: c.activeAgentCount }
        };
      })
      .sort(byConvictionDesc);
  }

  /// GET /markets/:marketId/conviction — conviction index for a single market. Reads on-chain
  /// when the ledger is configured (mapping symbol -> keccak256 hash), else the replay artifact.
  @Get(':marketId/conviction')
  async conviction(@Param('marketId') marketId: string): Promise<ConvictionIndex> {
    const deployed = readDeployedLedger();
    const ledgerAddress = process.env.SIBYL_LEDGER_ADDRESS ?? deployed?.address;
    const marketIdHex = toMarketIdHex(marketId);

    if (ledgerAddress) {
      try {
        const c = await readConvictionIndex(getAddress(ledgerAddress), marketIdHex);
        return {
          marketId,
          marketIdHex,
          totalWeight: c.totalWeight.toString(),
          activeAgentCount: c.activeAgentCount
        };
      } catch {
        // Fall through to the offline path.
      }
    }

    const markets = listMarkets();
    if (!markets.includes(marketId)) {
      throw new NotFoundException(`Unknown market: ${marketId}`);
    }
    const replay = readReplayArtifact();
    return convictionFor(marketId, replay ? scoresForMarket(replay, marketId) : []);
  }
}
