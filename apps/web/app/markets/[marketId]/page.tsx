import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  api,
  type AgentRow,
  type ChainStatus,
  type Consensus,
  type Decision,
  type Market
} from '../../../lib/api';
import { ConsensusGauge } from '../../../components/ConsensusGauge';
import { ConvictionBar } from '../../../components/ConvictionBar';
import { Leaderboard } from '../../../components/Leaderboard';
import { DecisionRow } from '../../../components/DecisionRow';

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function explorerBase(chain: ChainStatus): string {
  if (chain.explorer) return chain.explorer.replace(/\/(address|tx)\/.*/i, '');
  return 'https://explorer.sepolia.mantle.xyz';
}

export default async function MarketPage({ params }: { params: Promise<{ marketId: string }> }) {
  const { marketId } = await params;
  const id = decodeURIComponent(marketId);
  const q = `?marketId=${encodeURIComponent(id)}`;

  const [markets, consensus, agents, decisions, chain] = await Promise.all([
    api<Market[]>('/markets', []),
    api<Consensus>(`/consensus/${encodeURIComponent(id)}/latest`, {
      direction: 'FLAT',
      sizeBps: 0,
      confidence: 0.5,
      contributors: []
    }),
    api<AgentRow[]>(`/agents${q}`, []),
    api<Decision[]>(`/decisions${q}`, []),
    api<ChainStatus>('/chain/status', { status: 'pending' })
  ]);

  const market = markets.find((m) => m.marketId === id);
  const base = explorerBase(chain);

  const totalWeight = num(market?.conviction?.totalWeight);
  const activeAgentCount = num(market?.conviction?.activeAgentCount);
  const maxWeight = Math.max(0.0001, ...markets.map((m) => num(m.conviction?.totalWeight)), totalWeight);

  const sorted = [...decisions].sort((a, b) => b.timestamp - a.timestamp);
  const onchain = sorted.filter((d) => d.txHash).length;

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24">
      {/* Hero */}
      <header className="relative pt-8 pb-8">
        <Link href="/markets" className="font-mono text-xs text-muted transition-colors hover:text-brand">
          ← all markets
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            {market?.name ?? id}
          </h1>
          <span
            className={`rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest ${
              market?.active
                ? 'border-long/50 bg-long/10 text-long'
                : 'border-line bg-card/60 text-muted'
            }`}
          >
            {market?.active ? 'live' : 'idle'}
          </span>
        </div>
        <div className="mt-2 font-mono text-xs text-muted">{id}</div>
        <div className="mt-5 flex flex-wrap items-center gap-2 font-mono text-xs">
          <Pill>{agents.length} agents</Pill>
          <Pill>{activeAgentCount} active</Pill>
          <Pill>{sorted.length} decisions</Pill>
          <Pill>{onchain} on-chain</Pill>
        </div>
      </header>

      {/* Consensus + conviction */}
      <section className="grid items-stretch gap-5 md:grid-cols-[300px_1fr]">
        <ConsensusGauge
          direction={consensus.direction}
          confidence={consensus.confidence}
          sizeBps={consensus.sizeBps}
          contributors={consensus.contributors.length}
        />
        <div className="glass flex flex-col justify-center gap-5 rounded-2xl p-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-brand">market conviction</div>
            <h2 className="mt-2 font-display text-2xl font-semibold">
              Reputation weight × participation.
            </h2>
            <p className="mt-2 text-sm text-muted">
              The Conviction Index for this market blends the total reputation weight of its voters with how
              many agents are actively contributing this round.
            </p>
          </div>
          <ConvictionBar
            totalWeight={totalWeight}
            activeAgentCount={activeAgentCount}
            maxWeight={maxWeight}
          />
        </div>
      </section>

      {/* Per-market leaderboard */}
      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-xl font-semibold">Market leaderboard</h2>
          <span className="font-mono text-xs text-muted">ranked by consensus weight</span>
        </div>
        {agents.length > 0 ? (
          <Leaderboard agents={agents} />
        ) : (
          <div className="glass rounded-xl p-6 text-muted">
            No agents voting in this market yet — run <code className="font-mono">pnpm demo:seed</code>.
          </div>
        )}
      </section>

      {/* Per-market decisions */}
      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-xl font-semibold">Decision history</h2>
          <span className="font-mono text-xs text-muted">{sorted.length} rounds</span>
        </div>
        {sorted.length > 0 ? (
          <div className="relative">
            {sorted.map((d, i) => (
              <DecisionRow key={d.id} decision={d} index={i} isNewest={i === 0} explorerBase={base} />
            ))}
          </div>
        ) : (
          <div className="glass rounded-xl p-6 text-muted">No decisions recorded for this market yet.</div>
        )}
      </section>

      <footer className="mt-14 border-t border-line pt-6 text-center font-mono text-xs text-muted">
        per-market reputation-weighted consensus · decisions emitted on-chain to Mantle
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
