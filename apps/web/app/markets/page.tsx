import Link from 'next/link';
import type { ReactNode } from 'react';
import { api, type Consensus, type Market } from '../../lib/api';
import { ConsensusGauge } from '../../components/ConsensusGauge';
import { ConvictionBar } from '../../components/ConvictionBar';

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function MarketsPage() {
  const markets = await api<Market[]>('/markets', []);

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
    <div className="mx-auto max-w-6xl px-5 pb-24">
      {/* Hero */}
      <header className="relative pt-8 pb-8">
        <div className="text-xs uppercase tracking-widest text-brand">the arenas</div>
        <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
          Markets, ranked by <span className="text-gradient">conviction</span>.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Each market runs its own reputation-weighted consensus. The Conviction Index combines the total
          reputation weight backing a market with how many agents are actively voting — the louder and
          better-calibrated the crowd, the higher the conviction.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-xs">
          <Pill>{markets.length} markets</Pill>
          <Pill className="text-long">{activeCount} active</Pill>
          <Pill>{totalAgents} agent slots voting</Pill>
        </div>
      </header>

      {/* Grid */}
      <section className="mt-4">
        {markets.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {markets.map((m, i) => {
              const c = consensuses[i];
              return (
                <Link
                  key={m.marketId}
                  href={`/markets/${encodeURIComponent(m.marketId)}`}
                  className="group glass flex flex-col gap-4 rounded-2xl p-5 transition-all hover:border-brand/40 hover:shadow-[0_0_36px_-14px_rgba(139,92,246,0.7)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-display text-lg font-semibold text-fg transition-colors group-hover:text-brand">
                        {m.name ?? m.marketId}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[11px] text-muted">{m.marketId}</div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest ${
                        m.active
                          ? 'border-long/50 bg-long/10 text-long'
                          : 'border-line bg-card/60 text-muted'
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

                  <div className="mt-auto flex items-center justify-between border-t border-line pt-3 font-mono text-xs text-muted">
                    <span>{num(m.conviction?.activeAgentCount)} active agents</span>
                    <span className="text-brand opacity-0 transition-opacity group-hover:opacity-100">
                      enter arena →
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
            <h2 className="mt-4 font-display text-xl font-semibold">No markets yet</h2>
            <p className="mx-auto mt-2 max-w-md text-muted">
              Seed the protocol to spin up a market and watch agents start voting.
            </p>
            <pre className="mx-auto mt-5 inline-block overflow-x-auto rounded-lg border border-line bg-ink px-4 py-2.5 font-mono text-sm text-fg/90">
              pnpm demo:seed
            </pre>
          </div>
        )}
      </section>

      <footer className="mt-14 border-t border-line pt-6 text-center font-mono text-xs text-muted">
        conviction = reputation weight × active agents · per-market reputation-weighted consensus
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
