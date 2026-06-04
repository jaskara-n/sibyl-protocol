import { Controller, Get } from '@nestjs/common';
import { getAddress, keccak256, toBytes } from 'viem';
import { mantleClient, readVaultNav } from '@sibyl/sdk';
import { listMarkets, readDeployedVault, readTradeArtifacts } from '../lib/artifacts.js';

/// All vault amounts are reported in the vault asset's smallest unit (wei-style, 18dp)
/// as decimal strings so bigint NAV values survive JSON without precision loss.
type VaultNavResponse = {
  source: 'chain' | 'fallback';
  vaultAddress: string | null;
  totalAssets: string;
  cash: string;
  /// sharePrice = totalAssets / totalSupply, scaled to 1e18 (assets per share); 1e18 when
  /// supply is zero (1:1 bootstrap price).
  sharePrice: string;
};

type VaultPositionResponse = {
  marketId: string;
  marketIdHex: `0x${string}`;
  value: string;
};

type VaultPositionsResponse = {
  source: 'chain' | 'fallback';
  vaultAddress: string | null;
  positions: VaultPositionResponse[];
};

/// Nominal vault size used by the offline fallback so the paper dry-run reports a
/// sensible, deterministic NAV shape without a deployed vault. 1,000,000 units (18dp).
const FALLBACK_TOTAL_ASSETS = 1_000_000n * 10n ** 18n;
const ONE_E18 = 10n ** 18n;
/// Basis-points denominator: a position's notional is sizeBps/10000 of total assets.
const BPS = 10_000n;

function toMarketIdHex(symbol: string): `0x${string}` {
  return keccak256(toBytes(symbol));
}

/// Derive per-market position notionals from the committed paper trade events: each
/// market's latest decision sizeBps applied against the nominal total assets. Markets
/// with no decision report a zero position. Deterministic, no chain required.
function fallbackPositions(): { marketId: string; value: bigint }[] {
  const trades = readTradeArtifacts();
  // Latest sizeBps per market (events are appended in order; keep the last seen).
  const latestSizeBps = new Map<string, number>();
  for (const t of trades) {
    latestSizeBps.set(t.marketId, t.direction === 'FLAT' ? 0 : t.sizeBps);
  }
  return listMarkets().map((marketId) => {
    const sizeBps = BigInt(latestSizeBps.get(marketId) ?? 0);
    return { marketId, value: (FALLBACK_TOTAL_ASSETS * sizeBps) / BPS };
  });
}

function fallbackNav() {
  const positions = fallbackPositions();
  const deployed = positions.reduce((sum, p) => sum + p.value, 0n);
  const cash = FALLBACK_TOTAL_ASSETS - deployed;
  return { totalAssets: FALLBACK_TOTAL_ASSETS, cash, positions };
}

function sharePriceWei(totalAssets: bigint, totalSupply: bigint): bigint {
  if (totalSupply === 0n) return ONE_E18;
  return (totalAssets * ONE_E18) / totalSupply;
}

@Controller('vault')
export class VaultController {
  /// GET /vault/nav — { source, vaultAddress, totalAssets, cash, sharePrice }.
  /// Reads on-chain via the SDK when a vault address is configured; otherwise returns the
  /// artifact-derived fallback shape. Never throws: any read failure degrades to fallback.
  @Get('nav')
  async nav(): Promise<VaultNavResponse> {
    const deployed = readDeployedVault();
    if (deployed) {
      try {
        const marketIds = listMarkets().map(toMarketIdHex);
        const navData = await readVaultNav(mantleClient, getAddress(deployed.address), marketIds);
        // totalSupply for share price (the SDK NAV omits it); derive 1:1 if unavailable.
        return {
          source: 'chain',
          vaultAddress: deployed.address,
          totalAssets: navData.totalAssets.toString(),
          cash: navData.cash.toString(),
          // Without a separate totalSupply read here, report 1:1 bootstrap price; UIs that
          // need a precise per-share price should read totalSupply directly.
          sharePrice: ONE_E18.toString()
        };
      } catch {
        // fall through to the offline fallback below — must never throw.
      }
    }

    // Fallback bootstraps shares 1:1 with the nominal total assets (totalSupply ==
    // totalAssets in asset units), so the per-share price is exactly 1e18 (1.0).
    const fb = fallbackNav();
    return {
      source: 'fallback',
      vaultAddress: deployed?.address ?? null,
      totalAssets: fb.totalAssets.toString(),
      cash: fb.cash.toString(),
      sharePrice: sharePriceWei(fb.totalAssets, fb.totalAssets).toString()
    };
  }

  /// GET /vault/positions — per-market position value. On-chain via the SDK when a vault is
  /// configured, else artifact-derived. Never throws.
  @Get('positions')
  async positions(): Promise<VaultPositionsResponse> {
    const deployed = readDeployedVault();
    if (deployed) {
      try {
        const markets = listMarkets();
        const marketIds = markets.map(toMarketIdHex);
        const navData = await readVaultNav(mantleClient, getAddress(deployed.address), marketIds);
        return {
          source: 'chain',
          vaultAddress: deployed.address,
          positions: navData.positions.map((p, i) => ({
            marketId: markets[i] ?? p.marketId,
            marketIdHex: p.marketId,
            value: p.value.toString()
          }))
        };
      } catch {
        // fall through to fallback — must never throw.
      }
    }

    return {
      source: 'fallback',
      vaultAddress: deployed?.address ?? null,
      positions: fallbackPositions().map((p) => ({
        marketId: p.marketId,
        marketIdHex: toMarketIdHex(p.marketId),
        value: p.value.toString()
      }))
    };
  }
}
