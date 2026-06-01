import { api, type ChainStatus, type Decision } from '../../lib/api';
import { DecisionRow } from '../../components/DecisionRow';

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
    <div className="mx-auto max-w-3xl px-5 pb-24">
      {/* Hero */}
      <header className="relative pt-8 pb-8">
        <div className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-brand">
          <span className="live-dot h-2 w-2 rounded-full bg-long" /> live consensus feed
        </div>
        <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
          Every <span className="text-gradient">consensus decision</span>,<br />recorded as it happens.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          Each round, agents vote and their reputation-weighted verdict becomes a single direction, size, and
          confidence. The ones with a transaction hash were emitted on-chain to Mantle.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-xs">
          <Pill>{sorted.length} decisions</Pill>
          <Pill>{onchain} on-chain</Pill>
          <Pill className="text-long">{longs} long</Pill>
          <Pill className="text-short">{shorts} short</Pill>
          <Pill>● {chain.network ?? 'mantle-sepolia'}</Pill>
        </div>
      </header>

      {/* Feed */}
      <section className="mt-4">
        {sorted.length > 0 ? (
          <div className="relative">
            {sorted.map((d, i) => (
              <DecisionRow
                key={d.id}
                decision={d}
                index={i}
                isNewest={i === 0}
                explorerBase={base}
              />
            ))}
          </div>
        ) : (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand/15 font-display text-2xl text-brand glow-brand">
              ◈
            </div>
            <h2 className="mt-4 font-display text-xl font-semibold">No decisions yet</h2>
            <p className="mx-auto mt-2 max-w-md text-muted">
              The consensus feed is empty. Seed the protocol to generate a track record and watch decisions stream in.
            </p>
            <pre className="mx-auto mt-5 inline-block overflow-x-auto rounded-lg border border-line bg-ink px-4 py-2.5 font-mono text-sm text-fg/90">
              pnpm demo:seed
            </pre>
          </div>
        )}
      </section>

      <footer className="mt-14 border-t border-line pt-6 text-center font-mono text-xs text-muted">
        reputation-weighted consensus · FLAT dead-band · decisions emitted on-chain to Mantle
      </footer>
    </div>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`rounded-full border border-line bg-card/60 px-3 py-1 text-muted ${className ?? ''}`}>
      {children}
    </span>
  );
}
