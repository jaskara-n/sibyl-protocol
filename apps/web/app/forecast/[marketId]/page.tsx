import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Address } from 'viem';
import { api, type Prediction } from '../../../lib/api';
import { ProbabilityBar } from '../../../components/ProbabilityBar';
import { ForecastTradePanel } from '../../../components/ForecastTradePanel';
import { short } from '../../../lib/utils';

const SUSD_DECIMALS = 18;
const EXPLORER = 'https://explorer.sepolia.mantle.xyz';

function fmtReserve(v: string | null): string {
  if (v === null) return '—';
  try {
    const n = Number(v) / 10 ** SUSD_DECIMALS;
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 4 : 2 });
  } catch {
    return '—';
  }
}

function fmtResolveTime(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

function statusOf(p: Prediction): { label: string; cls: string } {
  if (p.resolved && p.outcomeLabel && p.outcomeLabel !== 'UNRESOLVED') {
    if (p.outcomeLabel === 'YES') return { label: 'resolved · YES', cls: 'border-long/50 bg-long/10 text-long' };
    if (p.outcomeLabel === 'NO') return { label: 'resolved · NO', cls: 'border-short/50 bg-short/10 text-short' };
    return { label: 'resolved · invalid', cls: 'border-amber/50 bg-amber/10 text-amber' };
  }
  const now = Math.floor(Date.now() / 1000);
  if (p.resolveTime && now >= p.resolveTime) {
    return { label: 'awaiting resolution', cls: 'border-amber/50 bg-amber/10 text-amber' };
  }
  return { label: 'open · trading', cls: 'border-long/50 bg-long/10 text-long' };
}

export default async function ForecastDetailPage({
  params
}: {
  params: Promise<{ marketId: string }>;
}) {
  const { marketId } = await params;
  const id = decodeURIComponent(marketId);

  // Fetch the single market; fall back to scanning the list when the detail
  // endpoint is unavailable (mirrors the markets pages' graceful fetch).
  const direct = await api<Prediction | null>(`/predictions/${encodeURIComponent(id)}`, null);
  const market =
    direct ??
    (await api<Prediction[]>('/predictions', [])).find((m) => m.marketId === id) ??
    null;

  if (!market) {
    return (
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-8">
        <Link href="/forecast" className="font-mono text-xs text-muted transition-colors hover:text-brand">
          ← all forecast markets
        </Link>
        <div className="glass mt-8 rounded-2xl p-8 text-center">
          <h1 className="font-display text-2xl font-semibold">Market not found</h1>
          <p className="mt-2 text-muted">No prediction market matches “{id}”.</p>
        </div>
      </div>
    );
  }

  const st = statusOf(market);
  const yesPct = market.priceYesPct;
  const noPct = typeof yesPct === 'number' ? 100 - yesPct : null;

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24">
      {/* Hero */}
      <header className="relative pt-8 pb-6">
        <Link href="/forecast" className="font-mono text-xs text-muted transition-colors hover:text-brand">
          ← all forecast markets
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <h1 className="max-w-3xl font-display text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl">
            {market.question ?? id}
          </h1>
          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest ${st.cls}`}
          >
            {st.label}
          </span>
        </div>
        <div className="mt-2 font-mono text-xs text-muted">{id}</div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_420px]">
        {/* Probability + facts */}
        <div className="space-y-6">
          <section className="glass rounded-2xl p-6">
            <div className="text-xs uppercase tracking-widest text-brand">implied probability</div>
            <div className="mt-4 flex items-end gap-8">
              <ProbValue label="YES" value={yesPct} accent="text-long" />
              <ProbValue label="NO" value={noPct} accent="text-short" />
            </div>
            <div className="mt-5">
              <ProbabilityBar yesPct={yesPct} />
            </div>
            <p className="mt-4 font-mono text-[11px] leading-relaxed text-muted">
              The FPMM sets <span className="text-fg">price(YES) = reserveNO / (reserveYES + reserveNO)</span>,
              so the YES price <span className="text-fg">is</span> the market-implied probability. Buying YES
              pushes its price up; buying NO pushes it down.
            </p>
          </section>

          <section className="glass rounded-2xl p-6">
            <div className="text-xs uppercase tracking-widest text-brand">market facts</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Fact label="YES reserve" value={fmtReserve(market.reserveYes)} />
              <Fact label="NO reserve" value={fmtReserve(market.reserveNo)} />
              <Fact label="resolves" value={fmtResolveTime(market.resolveTime)} />
              <Fact label="outcome" value={market.outcomeLabel ?? (market.resolved ? '—' : 'unresolved')} />
              <FactLink label="FPMM pool" value={market.fpmm} />
              <FactLink label="collateral" value={market.collateral} />
              <FactLink label="resolver" value={market.resolver} />
              <Fact
                label="data source"
                value={market.source === 'chain' ? 'live on-chain' : 'fallback (cached)'}
              />
            </div>
          </section>
        </div>

        {/* Trade panel */}
        <ForecastTradePanel
          marketIdHex={market.marketIdHex as Address}
          fpmm={(market.fpmm as Address | null) ?? null}
          resolver={(market.resolver as Address | null) ?? null}
          resolveTime={market.resolveTime}
          resolved={Boolean(market.resolved)}
        />
      </div>

      <footer className="mt-14 border-t border-line pt-6 text-center font-mono text-xs text-muted">
        binary prediction market · FPMM price = implied probability · settled on Mantle
      </footer>
    </div>
  );
}

function ProbValue({ label, value, accent }: { label: string; value: number | null; accent: string }) {
  const known = typeof value === 'number' && Number.isFinite(value);
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-1 font-display text-4xl font-bold tracking-tight ${accent}`}>
        {known ? `${(value as number).toFixed(1)}%` : '—'}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card/40 p-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className="mt-1 font-mono text-sm text-fg">{value}</div>
    </div>
  );
}

function FactLink({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl border border-line bg-card/40 p-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</div>
      {value ? (
        <a
          href={`${EXPLORER}/address/${value}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block font-mono text-sm text-cyan underline decoration-dotted hover:opacity-80"
        >
          {short(value)}
        </a>
      ) : (
        <div className="mt-1 font-mono text-sm text-muted">—</div>
      )}
    </div>
  );
}
