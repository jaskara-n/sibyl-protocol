import Link from 'next/link';
import type { ReactNode } from 'react';
import { api, type Consensus, type Market } from '../../lib/api';
import { ConsensusGauge } from '../../components/ConsensusGauge';
import { ConvictionBar } from '../../components/ConvictionBar';
import { LiveWireTicker } from '../../components/LiveWireTicker';
import { Reveal } from '../../components/landing/Reveal';

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function MarketsPage() {
  const fetched = await api<Market[]>('/markets', []);

  // The API already returns markets ranked by Conviction Index (totalWeight) DESC.
  // Re-sort here only as a robustness safety net so the leaderboard order is always correct.
  const markets = [...fetched].sort(
    (a, b) => num(b.conviction?.totalWeight) - num(a.conviction?.totalWeight)
  );

  const consensuses = await Promise.all(
    markets.map((m) =>
      api<Consensus>(`/consensus/${encodeURIComponent(m.marketId)}/latest`, {
        direction: 'FLAT',
        sizeBps: 0,
        confidence: 0.5,
        contributors: []
      })
    )
  );

  const maxWeight = Math.max(0.0001, ...markets.map((m) => num(m.conviction?.totalWeight)));
  const activeCount = markets.filter((m) => m.active).length;
  const totalAgents = markets.reduce((s, m) => s + num(m.conviction?.activeAgentCount), 0);

  return (
    <div className="relative z-0 bg-bureau text-bureau-fg">
      <LiveWireTicker />
      <div className="mx-auto max-w-6xl px-5 pb-24">
        {/* Header */}
        <header className="relative pt-12 pb-10">
          <p className="font-monod text-[11px] uppercase tracking-[0.2em] text-brass">The map</p>
          <h1 className="mt-4 font-serifd text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02]">
            Markets, ranked by <span className="italic text-brass">conviction.</span>
          </h1>
          <p className="mt-5 max-w-2xl font-sansd text-bureau-muted">
            Each market runs its own reputation-weighted consensus. The Conviction Index combines the
            total reputation weight backing a market with how many agents are actively voting — the
            louder and better-calibrated the crowd, the higher the conviction.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-2">
            <Stamp>{markets.length} markets</Stamp>
            <Stamp className="text-rise">{activeCount} active</Stamp>
            <Stamp>{totalAgents} agent slots voting</Stamp>
          </div>
        </header>

        <div className="tick-scale" aria-hidden />

        {/* Grid */}
        <section className="mt-10">
          {markets.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {markets.map((m, i) => {
                const c = consensuses[i];
                return (
                  <Reveal key={m.marketId} delay={i * 0.06}>
                    <Link
                      href={`/markets/${encodeURIComponent(m.marketId)}`}
                      className="group relative flex h-full flex-col gap-4 bureau-frame p-6 transition-colors hover:border-brass"
                    >
                      <div className="bureau-grain" aria-hidden />
                      {i === 0 && (
                        <span
                          aria-label="Conviction rank one: most active market"
                          className="absolute -top-3 right-5 grid h-10 w-10 rotate-[-6deg] place-items-center border border-brass font-serifd text-base text-brass transition-transform group-hover:rotate-0"
                        >
                          №1
                        </span>
                      )}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span
                            className={`shrink-0 font-monod text-sm ${
                              i === 0 ? 'text-brass' : 'text-bureau-muted'
                            }`}
                            title={`Conviction rank #${i + 1}`}
                          >
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-sansd text-lg font-semibold text-bureau-fg transition-colors group-hover:text-brass">
                              {m.name ?? m.marketId}
                            </div>
                            <div className="mt-0.5 truncate font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
                              {m.marketId}
                            </div>
                          </div>
                        </div>
                        <span
                          title={m.active ? 'Market is live' : 'Market is idle'}
                          aria-label={m.active ? 'Market status: live' : 'Market status: idle'}
                          className={`shrink-0 border px-2 py-0.5 font-monod text-[11px] uppercase tracking-[0.18em] ${
                            m.active ? 'border-rise text-rise' : 'border-bureau-line text-bureau-muted'
                          }`}
                        >
                          {m.active ? 'live' : 'idle'}
                        </span>
                      </div>

                      <ConsensusGauge
                        direction={c.direction}
                        confidence={c.confidence}
                        sizeBps={c.sizeBps}
                        contributors={c.contributors.length}
                      />

                      <ConvictionBar
                        totalWeight={num(m.conviction?.totalWeight)}
                        activeAgentCount={num(m.conviction?.activeAgentCount)}
                        maxWeight={maxWeight}
                        index={i}
                      />

                      <div className="mt-auto flex items-center justify-between border-t border-bureau-line pt-3 font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
                        <span>{num(m.conviction?.activeAgentCount)} active agents</span>
                        <span className="text-brass opacity-0 transition-opacity group-hover:opacity-100">
                          enter →
                        </span>
                      </div>
                    </Link>
                  </Reveal>
                );
              })}
            </div>
          ) : (
            <div className="bureau-frame p-10 text-center">
              <div className="bureau-grain" aria-hidden />
              <p className="font-serifd text-2xl italic text-bureau-muted">
                No markets on record yet.
              </p>
              <p className="mx-auto mt-3 max-w-md font-sansd text-sm text-bureau-muted">
                Markets appear here once agents start voting and a reputation-weighted consensus forms.
              </p>
            </div>
          )}
        </section>

        <footer className="mt-16 border-t border-bureau-line pt-6 text-center font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
          conviction = reputation weight × active agents · per-market reputation-weighted consensus
        </footer>
      </div>
    </div>
  );
}

function Stamp({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`border border-bureau-line px-2.5 py-1 font-monod text-[11px] uppercase tracking-[0.18em] text-bureau-muted ${
        className ?? ''
      }`}
    >
      {children}
    </span>
  );
}
