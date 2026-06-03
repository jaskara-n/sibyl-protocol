import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { getAddress } from 'viem';
import {
  OUTCOME_LABELS,
  readFpmm,
  readPredictionMarket
} from '@sibyl/sdk';
import {
  readDeployedPredictionMarkets,
  readPredictionMarketAddress,
  type DeployedPredictionMarket
} from '../lib/artifacts.js';

/// A binary prediction market enriched with LIVE on-chain state. All bigints are reported as
/// decimal strings so uint256 values survive JSON without precision loss.
///
/// `source` flags whether the on-chain enrichment succeeded ('chain') or the read failed and we
/// degraded to the static deployments data ('fallback'), mirroring the vault controller's graceful
/// fallback contract: this endpoint never throws on a chain read failure.
type PredictionMarketResponse = {
  source: 'chain' | 'fallback';
  marketId: string;
  marketIdHex: `0x${string}`;
  question: string | null;
  fpmm: `0x${string}` | null;
  collateral: `0x${string}` | null;
  resolver: `0x${string}` | null;
  /// Configured resolve time (unix seconds) from deployments; the on-chain value when available.
  resolveTime: number | null;
  /// On-chain outcome code: 0=UNRESOLVED, 1=YES, 2=NO, 3=INVALID. null when not read from chain.
  outcome: number | null;
  /// Human label for `outcome` (UNRESOLVED|YES|NO|INVALID). null when not read from chain.
  outcomeLabel: string | null;
  resolved: boolean | null;
  /// Implied YES probability as a 0..100 percent number (FPMM priceYES). null when not read.
  priceYesPct: number | null;
  /// YES outcome-token reserve held by the FPMM (decimal string). null when not read.
  reserveYes: string | null;
  /// NO outcome-token reserve held by the FPMM (decimal string). null when not read.
  reserveNo: string | null;
};

/// Build the static (no-chain) shape for a market so a chain failure still returns useful data.
function staticResponse(m: DeployedPredictionMarket): PredictionMarketResponse {
  return {
    source: 'fallback',
    marketId: m.marketId,
    marketIdHex: m.marketIdHex,
    question: m.question ?? null,
    fpmm: m.fpmm ?? null,
    collateral: m.collateral ?? null,
    resolver: m.resolver ?? null,
    resolveTime: m.resolveTime ?? null,
    outcome: null,
    outcomeLabel: null,
    resolved: null,
    priceYesPct: null,
    reserveYes: null,
    reserveNo: null
  };
}

@Controller('predictions')
export class PredictionsController {
  /// GET /predictions — every prediction market from deployments/mantle-sepolia.json
  /// ("predictionMarkets".markets), each enriched with LIVE on-chain state (market record +
  /// paired FPMM price/reserves) via the SDK. Per-market chain failures degrade that market to
  /// its static deployments shape (source: 'fallback'); the endpoint never throws.
  @Get()
  async list(): Promise<PredictionMarketResponse[]> {
    const markets = readDeployedPredictionMarkets();
    return Promise.all(markets.map((m) => this.enrich(m)));
  }

  /// GET /predictions/:marketId — one market's detail with the same enrichment. 404 when the
  /// marketId is not present in the deployments markets[] list.
  @Get(':marketId')
  async detail(@Param('marketId') marketId: string): Promise<PredictionMarketResponse> {
    const market = readDeployedPredictionMarkets().find((m) => m.marketId === marketId);
    if (!market) {
      throw new NotFoundException(`Unknown prediction market: ${marketId}`);
    }
    return this.enrich(market);
  }

  /// Enrich a static market entry with LIVE on-chain state. Reads the SibylPredictionMarket
  /// record (outcome/resolved/resolveTime/resolver/collateral) and, when an FPMM is configured,
  /// its price/reserve state. Any read failure returns the static fallback shape.
  private async enrich(m: DeployedPredictionMarket): Promise<PredictionMarketResponse> {
    const factory = readPredictionMarketAddress();
    if (!factory) return staticResponse(m);

    try {
      const market = await readPredictionMarket(m.marketIdHex, getAddress(factory));
      const fpmm = m.fpmm ? await readFpmm(getAddress(m.fpmm)) : null;
      return {
        source: 'chain',
        marketId: m.marketId,
        marketIdHex: m.marketIdHex,
        question: m.question ?? null,
        fpmm: m.fpmm ?? null,
        // Prefer the on-chain collateral/resolver when present, else the static config.
        collateral: (market.collateral as `0x${string}`) ?? m.collateral ?? null,
        resolver: (market.resolver as `0x${string}`) ?? m.resolver ?? null,
        resolveTime: market.resolveTime > 0n ? Number(market.resolveTime) : m.resolveTime ?? null,
        outcome: market.outcome,
        outcomeLabel: OUTCOME_LABELS[market.outcome] ?? null,
        resolved: market.resolved,
        priceYesPct: fpmm ? fpmm.priceYesPct : null,
        reserveYes: fpmm ? fpmm.reserveYes.toString() : null,
        reserveNo: fpmm ? fpmm.reserveNo.toString() : null
      };
    } catch {
      // Chain read failed — degrade gracefully to the static deployments data.
      return staticResponse(m);
    }
  }
}
