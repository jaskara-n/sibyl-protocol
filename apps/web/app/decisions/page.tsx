import { api, type ChainStatus, type Decision } from '../../lib/api';
import { DecisionRow } from '../../components/DecisionRow';
import { Reveal } from '../../components/landing/Reveal';

function explorerBase(chain: ChainStatus): string {
  if (chain.explorer) return chain.explorer.replace(/\/(address|tx)\/.*/i, '');
  return 'https://explorer.sepolia.mantle.xyz';
}

export default async function DecisionsPage() {
  const [decisions, chain] = await Promise.all([
    api<Decision[]>('/decisions', []),
    api<ChainStatus>('/chain/status', { status: 'pending' })
  ]);

  const base = explorerBase(chain);
  const sorted = [...decisions].sort((a, b) => b.timestamp - a.timestamp);
  const onchain = sorted.filter((d) => d.txHash).length;
  const longs = sorted.filter((d) => (d.direction || '').toUpperCase() === 'LONG').length;
  const shorts = sorted.filter((d) => (d.direction || '').toUpperCase() === 'SHORT').length;

  return (
    <div className="relative z-0 bg-bureau text-bureau-fg">
      <div className="mx-auto max-w-6xl px-5 pb-24">
        {/* Header */}
        <header className="relative pt-12 pb-10">
          <Reveal>
            <div className="flex items-center gap-3">
              <p className="font-monod text-[11px] uppercase tracking-[0.42em] text-brass">The record</p>
              <span className="flex items-center gap-2 font-monod text-[10px] uppercase tracking-[0.3em] text-bureau-muted">
                <span className="live-dot h-2 w-2 rounded-full" style={{ background: 'var(--color-rise)', boxShadow: '0 0 8px var(--color-rise)' }} aria-hidden />
                live feed
              </span>
            </div>
            <h1 className="mt-4 max-w-3xl font-serifd text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02]">
              Every consensus decision, <span className="italic text-brass">recorded</span> as it happens.
            </h1>
            <p className="mt-5 max-w-2xl font-sansd text-base leading-relaxed text-bureau-muted">
              Each round, agents vote and their reputation-weighted verdict becomes a single direction, size, and
              confidence. The ones with a transaction hash were emitted on-chain to Mantle.
            </p>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="mt-7 flex flex-wrap items-center gap-2">
              <Stamp>{sorted.length} decisions</Stamp>
              <Stamp>{onchain} on-chain</Stamp>
              <Stamp className="text-rise">{longs} long</Stamp>
              <Stamp className="text-fall">{shorts} short</Stamp>
              <Stamp>{chain.network ?? 'mantle-sepolia'}</Stamp>
            </div>
          </Reveal>
        </header>

        <div className="tick-scale" aria-hidden />

        {/* Feed — a ruled wire-service log */}
        <section className="mt-10 max-w-3xl" aria-live="polite" aria-label="Live consensus decision feed">
          {sorted.length > 0 ? (
            <div className="bureau-frame">
              <div className="bureau-grain" aria-hidden />
              {sorted.map((d, i) => (
                <DecisionRow
                  key={d.id}
                  decision={d}
                  index={i}
                  isNewest={i === 0}
                  explorerBase={base}
                  isLast={i === sorted.length - 1}
                />
              ))}
            </div>
          ) : (
            <div className="bureau-frame p-10 text-center">
              <div className="bureau-grain" aria-hidden />
              <p className="font-serifd text-2xl italic text-bureau-muted">No decisions yet.</p>
              <p className="mx-auto mt-3 max-w-md font-sansd text-sm leading-relaxed text-bureau-muted">
                They stream in as agents vote and each round&apos;s reputation-weighted consensus is formed.
              </p>
            </div>
          )}
        </section>

        <footer className="mt-14 border-t border-bureau-line pt-6 text-center font-monod text-[10px] uppercase tracking-[0.3em] text-bureau-muted/70">
          reputation-weighted consensus · FLAT dead-band · decisions emitted on-chain to Mantle
        </footer>
      </div>
    </div>
  );
}

function Stamp({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`border border-bureau-line px-2.5 py-0.5 font-monod text-[10px] uppercase tracking-[0.18em] text-bureau-muted ${className ?? ''}`}
    >
      {children}
    </span>
  );
}
