import Link from 'next/link';
import type { ReactNode } from 'react';
import { api, type Prediction } from '../../lib/api';
import { ProbabilityBar } from '../../components/ProbabilityBar';

const SUSD_DECIMALS = 18;

/** Format a decimal-string uint256 (18 dec) as a compact human number. */
function fmtReserve(v: string | null): string {
  if (v === null) return '—';
  try {
    const n = Number(v) / 10 ** SUSD_DECIMALS;
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 4 : 0 });
  } catch {
    return '—';
  }
}

/** Resolution status descriptor for the badge. */
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

function fmtResolveTime(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default async function ForecastPage() {
  const markets = await api<Prediction[]>('/predictions', []);

  const open = markets.filter((m) => !m.resolved).length;
  const live = markets.filter((m) => m.source === 'chain').length;

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24">
      {/* Hero */}
      <header className="relative pt-8 pb-8">
        <div className="text-xs uppercase tracking-widest text-brand">forecast markets</div>
        <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
          Trade the <span className="text-gradient">probability</span> of the future.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Binary prediction markets on Mantle. Each market has a fixed-product market maker where the
          YES price <span className="text-fg">is</span> the implied probability — buy YES or NO, mint and
          redeem complete sets, and claim winnings after resolution.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-xs">
          <Pill>{markets.length} markets</Pill>
          <Pill className="text-long">{open} open</Pill>
          <Pill className="text-cyan">{live} live on-chain</Pill>
        </div>
      </header>

      {/* Grid */}
      <section className="mt-4">
        {markets.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {markets.map((m, i) => {
              const st = statusOf(m);
              return (
                <Link
                  key={m.marketId}
                  href={`/forecast/${encodeURIComponent(m.marketId)}`}
                  className="group glass relative flex flex-col gap-4 rounded-2xl p-5 transition-all hover:border-brand/40 hover:shadow-[0_0_36px_-14px_rgba(139,92,246,0.7)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-display text-base font-semibold leading-snug text-fg transition-colors group-hover:text-brand">
                        {m.question ?? m.marketId}
                      </div>
                      <div className="mt-1 truncate font-mono text-[11px] text-muted">{m.marketId}</div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest ${st.cls}`}
                    >
                      {st.label}
                    </span>
                  </div>

                  <ProbabilityBar yesPct={m.priceYesPct} index={i} />

                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="YES reserve" value={fmtReserve(m.reserveYes)} accent="text-long" />
                    <Stat label="NO reserve" value={fmtReserve(m.reserveNo)} accent="text-short" />
                  </div>

                  <div className="mt-auto flex items-center justify-between border-t border-line pt-3 font-mono text-xs text-muted">
                    <span>resolves {fmtResolveTime(m.resolveTime)}</span>
                    <span className="text-brand opacity-0 transition-opacity group-hover:opacity-100">
                      trade →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand/15 font-display text-2xl text-brand glow-brand">
              ◈
            </div>
            <h2 className="mt-4 font-display text-xl font-semibold">No prediction markets yet</h2>
            <p className="mx-auto mt-2 max-w-md text-muted">
              Launch one permissionlessly through the PredictionFactory, or seed the demo to spin up a
              sample market.
            </p>
            <pre className="mx-auto mt-5 inline-block overflow-x-auto rounded-lg border border-line bg-ink px-4 py-2.5 font-mono text-sm text-fg/90">
              pnpm demo:seed
            </pre>
          </div>
        )}
      </section>

      <footer className="mt-14 border-t border-line pt-6 text-center font-mono text-xs text-muted">
        FPMM price = implied probability · complete-set mint/redeem · resolver-gated resolution on Mantle
      </footer>
    </div>
  );
}

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={`rounded-full border border-line bg-card/60 px-3 py-1 text-muted ${className ?? ''}`}>
      {children}
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card/40 p-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-1 font-mono text-sm font-semibold ${accent ?? 'text-fg'}`}>{value}</div>
    </div>
  );
}
