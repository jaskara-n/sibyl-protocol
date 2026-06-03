import Link from 'next/link';
import { api, type Prediction } from '../../lib/api';
import { ProbabilityBar } from '../../components/ProbabilityBar';
import { Reveal } from '../../components/landing/Reveal';

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

/** Resolution status descriptor for the badge stamp. */
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
    <div className="relative z-0 bg-bureau text-bureau-fg">
      <div className="mx-auto max-w-6xl px-5 pb-24">
        {/* Header */}
        <header className="relative pt-12 pb-10">
          <p className="font-monod text-[11px] uppercase tracking-[0.2em] text-brass">The forecast</p>
          <h1 className="mt-4 max-w-3xl font-serifd text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02]">
            Trade the <span className="italic text-brass">probability</span> of the future.
          </h1>
          <p className="mt-5 max-w-2xl font-sansd text-sm leading-relaxed text-bureau-muted">
            Binary prediction markets on Mantle. Each market has a fixed-product market maker where the YES
            price is the implied probability — buy YES or NO, mint and redeem complete sets, and claim
            winnings after resolution.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-2 font-monod text-[11px] uppercase tracking-[0.18em]">
            <Stamp>{markets.length} markets</Stamp>
            <Stamp className="border-rise text-rise">{open} open</Stamp>
            <Stamp className="border-brass text-brass">{live} live on-chain</Stamp>
          </div>
        </header>

        <div className="tick-scale" aria-hidden />

        {/* Dossier grid */}
        <section className="mt-12">
          {markets.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {markets.map((m, i) => {
                const st = statusOf(m);
                return (
                  <Reveal key={m.marketId} delay={i * 0.05}>
                    <Link
                      href={`/forecast/${encodeURIComponent(m.marketId)}`}
                      className="bureau-frame group flex h-full flex-col gap-4 p-6 transition-colors hover:border-brass"
                    >
                      <div className="bureau-grain" aria-hidden />
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-serifd text-xl leading-snug text-bureau-fg transition-colors group-hover:text-brass">
                            {m.question ?? m.marketId}
                          </div>
                          <div className="mt-1 truncate font-monod text-[11px] text-bureau-muted">{m.marketId}</div>
                        </div>
                        <span
                          title={`Status: ${st.label}`}
                          aria-label={`Market status: ${st.label}`}
                          className={`shrink-0 border px-2 py-0.5 font-monod text-[11px] uppercase tracking-[0.18em] ${st.cls}`}
                        >
                          {st.label}
                        </span>
                      </div>

                      <ProbabilityBar yesPct={m.priceYesPct} index={i} />

                      <div className="grid grid-cols-2 gap-3">
                        <Stat label="YES reserve" value={fmtReserve(m.reserveYes)} accent="text-rise" />
                        <Stat label="NO reserve" value={fmtReserve(m.reserveNo)} accent="text-fall" />
                      </div>

                      <div className="mt-auto flex items-center justify-between border-t border-bureau-line pt-3 font-monod text-[11px] uppercase tracking-[0.18em] text-bureau-muted">
                        <span>resolves {fmtResolveTime(m.resolveTime)}</span>
                        <span className="text-brass opacity-0 transition-opacity group-hover:opacity-100">
                          trade →
                        </span>
                      </div>
                    </Link>
                  </Reveal>
                );
              })}
            </div>
          ) : (
            <div className="bureau-frame relative p-10 text-center">
              <div className="bureau-grain" aria-hidden />
              <h2 className="font-serifd text-2xl text-bureau-fg">No prediction markets yet</h2>
              <p className="mx-auto mt-3 max-w-md font-sansd text-sm text-bureau-muted">
                No prediction markets yet — launch one from{' '}
                <Link href="/create" className="text-brass hover:underline">
                  /create
                </Link>
                .
              </p>
            </div>
          )}
        </section>

        <footer className="mt-16 border-t border-bureau-line pt-6 text-center font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted/70">
          FPMM price = implied probability · complete-set mint/redeem · resolver-gated resolution on Mantle
        </footer>
      </div>
    </div>
  );
}

function Stamp({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`border border-bureau-line px-2 py-0.5 text-bureau-muted ${className ?? ''}`}>
      {children}
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="border border-bureau-line bg-bureau p-3">
      <div className="font-monod text-[11px] uppercase tracking-[0.18em] text-bureau-muted">{label}</div>
      <div className={`mt-1 font-monod text-sm font-semibold ${accent ?? 'text-bureau-fg'}`}>{value}</div>
    </div>
  );
}
