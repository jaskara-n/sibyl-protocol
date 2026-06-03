import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Address } from 'viem';
import { api, type Prediction } from '../../../lib/api';
import { ProbabilityBar } from '../../../components/ProbabilityBar';
import { ForecastTradePanel } from '../../../components/ForecastTradePanel';
import { Reveal } from '../../../components/landing/Reveal';
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
    if (p.outcomeLabel === 'YES') return { label: 'resolved · YES', cls: 'border-rise text-rise' };
    if (p.outcomeLabel === 'NO') return { label: 'resolved · NO', cls: 'border-fall text-fall' };
    return { label: 'resolved · invalid', cls: 'border-brass text-brass' };
  }
  const now = Math.floor(Date.now() / 1000);
  if (p.resolveTime && now >= p.resolveTime) {
    return { label: 'awaiting resolution', cls: 'border-brass text-brass' };
  }
  return { label: 'open · trading', cls: 'border-rise text-rise' };
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
      <div className="relative z-0 bg-bureau text-bureau-fg">
        <div className="mx-auto max-w-3xl px-5 pb-24 pt-12">
          <Link
            href="/forecast"
            aria-label="Back to all forecast markets"
            className="font-monod text-[11px] uppercase tracking-[0.18em] text-bureau-muted transition-colors hover:text-brass"
          >
            ← all forecast markets
          </Link>
          <div className="bureau-frame relative mt-8 p-10 text-center">
            <div className="bureau-grain" aria-hidden />
            <h1 className="font-serifd text-3xl text-bureau-fg">Market not found</h1>
            <p className="mt-3 font-sansd text-sm text-bureau-muted">No prediction market matches &ldquo;{id}&rdquo;.</p>
          </div>
        </div>
      </div>
    );
  }

  const st = statusOf(market);
  const yesPct = market.priceYesPct;
  const noPct = typeof yesPct === 'number' ? 100 - yesPct : null;

  return (
    <div className="relative z-0 bg-bureau text-bureau-fg">
      <div className="mx-auto max-w-6xl px-5 pb-24">
        {/* Header */}
        <header className="relative pt-12 pb-8">
          <Link
            href="/forecast"
            aria-label="Back to all forecast markets"
            className="font-monod text-[11px] uppercase tracking-[0.18em] text-bureau-muted transition-colors hover:text-brass"
          >
            ← all forecast markets
          </Link>
          <p className="mt-6 font-monod text-[11px] uppercase tracking-[0.42em] text-brass">The forecast</p>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
            <h1 className="max-w-3xl font-serifd text-[clamp(2rem,4vw,3.2rem)] leading-[1.04]">
              {market.question ?? id}
            </h1>
            <span
              title={`Status: ${st.label}`}
              aria-label={`Market status: ${st.label}`}
              className={`shrink-0 border px-2.5 py-1 font-monod text-[10px] uppercase tracking-[0.18em] ${st.cls}`}
            >
              {st.label}
            </span>
          </div>
          <div className="mt-3 font-monod text-[11px] text-bureau-muted">{id}</div>
        </header>

        <div className="tick-scale" aria-hidden />

        <div className="mt-10 flex flex-col items-stretch gap-6 lg:flex-row lg:items-start">
          {/* Probability + facts */}
          <div className="min-w-0 flex-1 space-y-6">
            <Reveal>
              <section className="bureau-frame relative p-6">
                <div className="bureau-grain" aria-hidden />
                <div className="font-monod text-[11px] uppercase tracking-[0.32em] text-brass">
                  implied probability
                </div>
                <div className="mt-5 flex items-end gap-10">
                  <ProbValue label="YES" value={yesPct} accent="text-rise" />
                  <ProbValue label="NO" value={noPct} accent="text-fall" />
                </div>
                <div className="mt-6">
                  <ProbabilityBar yesPct={yesPct} />
                </div>
                <p className="mt-5 font-monod text-[11px] leading-relaxed text-bureau-muted">
                  The FPMM sets{' '}
                  <span className="text-bureau-fg">price(YES) = reserveNO / (reserveYES + reserveNO)</span>, so
                  the YES price <span className="text-bureau-fg">is</span> the market-implied probability.
                  Buying YES pushes its price up; buying NO pushes it down.
                </p>
              </section>
            </Reveal>

            <Reveal delay={0.1}>
              <section className="bureau-frame relative p-6">
                <div className="bureau-grain" aria-hidden />
                <div className="flex items-baseline justify-between border-b border-bureau-line pb-3">
                  <span className="font-monod text-[11px] uppercase tracking-[0.32em] text-brass">
                    market facts
                  </span>
                  <span className="font-monod text-[10px] uppercase tracking-[0.28em] text-bureau-muted">
                    {market.source === 'chain' ? 'live on-chain' : 'fallback · cached'}
                  </span>
                </div>
                <dl className="mt-5 space-y-3.5">
                  <FactRow label="YES reserve" value={fmtReserve(market.reserveYes)} />
                  <FactRow label="NO reserve" value={fmtReserve(market.reserveNo)} />
                  <FactRow label="resolves" value={fmtResolveTime(market.resolveTime)} />
                  <FactRow label="outcome" value={market.outcomeLabel ?? (market.resolved ? '—' : 'unresolved')} />
                  <FactLink label="FPMM pool" value={market.fpmm} />
                  <FactLink label="collateral" value={market.collateral} />
                  <FactLink label="resolver" value={market.resolver} last />
                </dl>
              </section>
            </Reveal>
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

        <footer className="mt-16 border-t border-bureau-line pt-6 text-center font-monod text-[10px] uppercase tracking-[0.3em] text-bureau-muted/70">
          binary prediction market · FPMM price = implied probability · settled on Mantle
        </footer>
      </div>
    </div>
  );
}

function ProbValue({ label, value, accent }: { label: string; value: number | null; accent: string }) {
  const known = typeof value === 'number' && Number.isFinite(value);
  return (
    <div>
      <div className="font-monod text-[11px] uppercase tracking-[0.18em] text-bureau-muted">{label}</div>
      <div className={`mt-1 font-serifd text-5xl leading-none ${accent}`}>
        {known ? `${(value as number).toFixed(1)}%` : '—'}
      </div>
    </div>
  );
}

function FactRow({ label, value, last }: { label: string; value: ReactNode; last?: boolean }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-6 pb-3.5 ${last ? '' : 'border-b border-bureau-line/60'}`}
    >
      <dt className="font-monod text-[10px] uppercase tracking-[0.28em] text-bureau-muted">{label}</dt>
      <dd className="text-right font-monod text-sm text-bureau-fg">{value}</dd>
    </div>
  );
}

function FactLink({ label, value, last }: { label: string; value: string | null; last?: boolean }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-6 pb-3.5 ${last ? '' : 'border-b border-bureau-line/60'}`}
    >
      <dt className="font-monod text-[10px] uppercase tracking-[0.28em] text-bureau-muted">{label}</dt>
      <dd className="text-right">
        {value ? (
          <a
            href={`${EXPLORER}/address/${value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-monod text-sm text-brass hover:underline"
          >
            {short(value)} ↗
          </a>
        ) : (
          <span className="font-monod text-sm text-bureau-muted">—</span>
        )}
      </dd>
    </div>
  );
}
