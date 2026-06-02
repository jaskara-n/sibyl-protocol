import type { AgentInput } from '@sibyl/agents';

/// Live market data for the agent snapshot, sourced from Bybit's public v5 API
/// (no key required) — this is the "Bybit API support" the AI Trading track expects.
/// Falls back to a deterministic synthetic snapshot if the network is unavailable (CI/offline).

const BYBIT = 'https://api.bybit.com';
const SYMBOL_MAP: Record<string, string> = { 'MNT-USD': 'MNTUSDT', 'ETH-USD': 'ETHUSDT' };

/// Per-market base price + a deterministic phase offset, so each market produces an independent
/// (but still deterministic) synthetic snapshot in the offline fallback.
const MARKET_PROFILE: Record<string, { basePrice: number; phase: number }> = {
  'MNT-USD': { basePrice: 0.85, phase: 0 },
  'ETH-USD': { basePrice: 3200, phase: Math.PI / 2 }
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`bybit ${res.status}`);
  return res.json();
}

/// Deterministic, per-market fallback snapshot. Each market has its own base price + phase
/// offset so MNT-USD and ETH-USD yield different signals (and thus independent consensus)
/// without any RNG — keeping the offline dry-run reproducible.
export function syntheticSnapshot(symbol = 'MNT-USD'): AgentInput {
  const now = Math.floor(Date.now() / 1000);
  const profile = MARKET_PROFILE[symbol] ?? { basePrice: 1, phase: 0 };
  const p = profile.phase;
  const wave = Math.sin(now / 3600 + p);
  return {
    marketId: symbol,
    symbol,
    timestamp: now,
    price: profile.basePrice * (1 + wave * 0.03),
    fundingRate: 0.002 * Math.cos(now / 1800 + p),
    oiDelta: Math.sin(now / 2400 + p),
    momentum: Math.sin(now / 1200 + p),
    newsSentiment: Math.cos(now / 2700 + p)
  };
}

function newsSentiment(): number {
  const n = Number(process.env.NEWS_SENTIMENT);
  return Number.isFinite(n) ? clamp(n, -1, 1) : 0; // pluggable; neutral until a real X/LLM feed is wired
}

/// Build an AgentInput from live Bybit data. Real metrics are normalized into the [-1, 1]
/// range the agents expect (funding is passed through; it is naturally small).
export async function fetchMarketSnapshot(symbol = 'MNT-USD'): Promise<AgentInput> {
  const s = SYMBOL_MAP[symbol] ?? 'MNTUSDT';
  try {
    const [tick, kline, oi] = await Promise.all([
      getJson(`${BYBIT}/v5/market/tickers?category=linear&symbol=${s}`),
      getJson(`${BYBIT}/v5/market/kline?category=linear&symbol=${s}&interval=60&limit=12`),
      getJson(`${BYBIT}/v5/market/open-interest?category=linear&symbol=${s}&intervalTime=1h&limit=2`)
    ]);

    const t = tick?.result?.list?.[0];
    if (!t) throw new Error('no ticker');
    const price = Number(t.lastPrice);
    const fundingRate = Number(t.fundingRate);

    const closes: number[] = (kline?.result?.list ?? []).map((c: string[]) => Number(c[4]));
    const newest = closes[0];
    const oldest = closes[closes.length - 1];
    const momPct = oldest > 0 ? (newest - oldest) / oldest : 0;

    const oiList = oi?.result?.list ?? [];
    let oiPct = 0;
    if (oiList.length >= 2) {
      const a = Number(oiList[0].openInterest);
      const b = Number(oiList[1].openInterest);
      oiPct = b > 0 ? (a - b) / b : 0;
    }

    return {
      marketId: symbol,
      symbol,
      timestamp: Math.floor(Date.now() / 1000),
      price,
      fundingRate,
      oiDelta: clamp(Math.tanh(oiPct * 10), -1, 1),
      momentum: clamp(Math.tanh(momPct * 20), -1, 1),
      newsSentiment: newsSentiment()
    };
  } catch (error) {
    console.warn('Bybit fetch failed, using synthetic snapshot:', (error as Error).message);
    return syntheticSnapshot(symbol);
  }
}
