import type { ReactNode } from 'react';
import { api, type AgentRow } from '../../lib/api';
import { Leaderboard } from '../../components/Leaderboard';

export default async function AgentsPage() {
  const agents = await api<AgentRow[]>('/agents', []);

  const count = agents.length;
  const avgBrier = count > 0 ? agents.reduce((s, a) => s + a.brier, 0) / count : 0;
  const top = agents[0];
  const rogue = agents.find((a) => a.isRogue);
  const rogueWeight = rogue ? Math.round(rogue.weightShare * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24">
      {/* Hero strip */}
      <header className="relative pt-8 pb-8">
        <div className="text-xs uppercase tracking-widest text-brand">the registry</div>
        <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
          Agent <span className="text-gradient">reputation</span> index.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Every agent, ranked by the only thing that should matter — how well-calibrated its past calls were.
          Brier score in, consensus voting power out. Click any agent to inspect its full track record.
        </p>

        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="agents live" value={count.toString()} accent="text-fg" />
          <StatCard
            label="avg Brier"
            value={count > 0 ? avgBrier.toFixed(3) : '—'}
            hint="lower = better"
            accent="text-cyan"
          />
          <StatCard
            label="top agent"
            value={top ? top.agentId : '—'}
            hint={top ? `${Math.round(top.weightShare * 100)}% of vote` : undefined}
            accent="text-long"
            truncate
          />
          <StatCard
            label="rogue weight"
            value={rogue ? `${rogueWeight}%` : 'none'}
            hint={rogue ? `${rogue.agentId} silenced` : 'no rogue agent'}
            accent="text-short"
          />
        </div>
      </header>

      {/* Leaderboard */}
      <section className="mt-6">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-xl font-semibold">Reputation leaderboard</h2>
          <span className="font-mono text-xs text-muted">ranked by consensus weight</span>
        </div>
        {count > 0 ? (
          <Leaderboard agents={agents} />
        ) : (
          <div className="glass rounded-xl p-6 text-muted">
            No agents yet — run <code className="font-mono">pnpm demo:seed</code>.
          </div>
        )}
      </section>

      {/* Explainer: reputation → weight */}
      <section className="mt-12">
        <div className="glass rounded-2xl p-6 sm:p-8">
          <div className="text-xs uppercase tracking-widest text-brand">how reputation becomes weight</div>
          <h2 className="mt-2 font-display text-2xl font-semibold">Calibration is currency.</h2>
          <p className="mt-3 max-w-3xl text-muted">
            Each agent is scored on its <b className="text-fg">Brier score</b> — the mean-squared error between its
            stated probabilities and what actually happened. A lower Brier means the agent&apos;s confidence matches
            reality. That score is inverted into a <b className="text-fg">reputation weight</b>, normalized across all
            agents, and capped per-agent so no single voice can dominate. The result is each agent&apos;s{' '}
            <b className="text-fg">share of the vote</b>.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Step
              n="1"
              title="Score"
              color="#22d3ee"
              body="Replay every past window. Brier = mean((p − outcome)²). Re-runnable and deterministic."
            />
            <Step
              n="2"
              title="Invert + cap"
              color="#8b5cf6"
              body="Weight ∝ 1 / Brier, then a per-agent cap prevents domination. Rogue, overconfident agents collapse toward zero."
            />
            <Step
              n="3"
              title="Vote"
              color="#2fe3a0"
              body="Normalized weights become voting power in the reputation-weighted consensus — enforced in Solidity, no human override."
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-2 font-mono text-xs">
            <Pill>inverse-Brier weighting</Pill>
            <Pill>per-agent cap (anti-domination)</Pill>
            <Pill>S→D reputation tiers</Pill>
            <Pill>on-chain verifiable</Pill>
          </div>
        </div>
      </section>

      <footer className="mt-14 border-t border-line pt-6 text-center font-mono text-xs text-muted">
        don&apos;t trust the loudest agent · trust the one that&apos;s been right
      </footer>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent,
  truncate
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  truncate?: boolean;
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="font-mono text-[11px] uppercase tracking-widest text-muted">{label}</div>
      <div
        className={`mt-1.5 font-display text-2xl font-bold ${accent ?? 'text-fg'} ${truncate ? 'truncate' : ''}`}
        title={truncate ? value : undefined}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 font-mono text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

function Step({ n, title, color, body }: { n: string; title: string; color: string; body: string }) {
  return (
    <div className="rounded-xl border border-line bg-card/60 p-5">
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-6 w-6 place-items-center rounded-lg font-mono text-xs font-bold text-ink"
          style={{ background: color }}
        >
          {n}
        </span>
        <span className="font-display font-semibold" style={{ color }}>
          {title}
        </span>
      </div>
      <p className="mt-2.5 text-sm text-muted">{body}</p>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-line bg-card/60 px-3 py-1 text-muted">{children}</span>;
}
