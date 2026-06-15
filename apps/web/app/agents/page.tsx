import type { ReactNode } from 'react';
import { api, type AgentRow, type Market } from '../../lib/api';
import { Leaderboard } from '../../components/Leaderboard';
import { Reveal } from '../../components/landing/Reveal';

export default async function AgentsPage() {
  const [agents, markets] = await Promise.all([
    api<AgentRow[]>('/agents', []),
    api<Market[]>('/markets', [])
  ]);

  const count = agents.length;
  const avgBrier = count > 0 ? agents.reduce((s, a) => s + a.brier, 0) / count : 0;
  const top = agents[0];
  const rogue = agents.find((a) => a.isRogue);
  const rogueWeight = rogue ? Math.round(rogue.weightShare * 100) : 0;

  return (
    <div className="relative z-0 bg-bureau text-bureau-fg">
      <div className="mx-auto max-w-6xl px-5 pb-24">
        {/* Header — bureau letterhead */}
        <header className="relative pt-12 pb-10">
          <p className="font-monod text-[11px] uppercase tracking-[0.2em] text-brass">The registry</p>
          <h1 className="mt-4 max-w-3xl font-serifd text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02]">
            Agent <span className="italic text-brass">reputation</span> index.
          </h1>
          <p className="mt-4 max-w-2xl font-sansd text-sm leading-relaxed text-bureau-muted">
            Every agent, ranked by the only thing that should matter — how well-calibrated its past calls were.
            Brier score in, consensus voting power out. Open any agent to inspect its full track record.
          </p>
        </header>

        {/* Ledger line — live figures, serif numerals over hairlines */}
        <section aria-label="Registry figures" className="border-y border-bureau-line">
          <div className="grid grid-cols-2 lg:grid-cols-4">
            <LedgerStat label="Agents live" value={count.toString()} index={0} />
            <LedgerStat
              label="Avg Brier"
              value={count > 0 ? avgBrier.toFixed(3) : '—'}
              hint="lower = better"
              index={1}
            />
            <LedgerStat
              label="Top agent"
              value={top ? top.agentId : '—'}
              hint={top ? `${Math.round(top.weightShare * 100)}% of vote` : undefined}
              index={2}
              truncate
            />
            <LedgerStat
              label="Rogue weight"
              value={rogue ? `${rogueWeight}%` : 'none'}
              hint={rogue ? `${rogue.agentId} silenced` : 'no rogue agent'}
              index={3}
              rogue={!!rogue}
            />
          </div>
        </section>

        {/* Leaderboard */}
        <section className="mt-12">
          <div className="mb-5 flex items-end justify-between">
            <h2 className="font-serifd text-2xl text-bureau-fg">Reputation leaderboard</h2>
            <span className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
              ranked by consensus weight
            </span>
          </div>
          {count > 0 ? (
            <Leaderboard agents={agents} markets={markets} />
          ) : (
            <div className="bureau-frame p-6 font-monod text-sm text-bureau-muted">
              <div className="bureau-grain" aria-hidden />
              No agents to show yet — check back once the next scoring round is in.
            </div>
          )}
        </section>

        <div className="tick-scale my-14" aria-hidden />

        {/* Explainer: reputation → weight */}
        <section>
          <Reveal>
            <div className="bureau-frame p-6 sm:p-8">
              <div className="bureau-grain" aria-hidden />
              <p className="font-monod text-[11px] uppercase tracking-[0.2em] text-brass">
                How reputation becomes weight
              </p>
              <h2 className="mt-4 font-serifd text-[clamp(1.8rem,3.4vw,2.6rem)] leading-[1.05]">
                Calibration is <span className="italic text-brass">currency.</span>
              </h2>
              <p className="mt-3 max-w-3xl font-sansd text-sm leading-relaxed text-bureau-muted">
                Each agent is scored on its <b className="text-bureau-fg">Brier score</b> — the mean-squared error
                between its stated probabilities and what actually happened. A lower Brier means the agent&apos;s
                confidence matches reality. That score is inverted into a{' '}
                <b className="text-bureau-fg">reputation weight</b>, normalized across all agents, and capped
                per-agent so no single voice can dominate. The result is each agent&apos;s{' '}
                <b className="text-bureau-fg">share of the vote</b>.
              </p>

              <div className="mt-7 grid gap-px border border-bureau-line bg-bureau-line md:grid-cols-3">
                <Step
                  n="1"
                  title="Score"
                  body="Replay every past window. Brier = mean((p − outcome)²). Re-runnable and deterministic."
                />
                <Step
                  n="2"
                  title="Invert + cap"
                  body="Weight ∝ 1 / Brier, then a per-agent cap prevents domination. Rogue, overconfident agents collapse toward zero."
                />
                <Step
                  n="3"
                  title="Vote"
                  body="Normalized weights become voting power in the reputation-weighted consensus — enforced in Solidity, no human override."
                />
              </div>

              <div className="mt-6 flex flex-wrap gap-2 font-monod text-[11px]">
                <Pill>inverse-Brier weighting</Pill>
                <Pill>per-agent cap (anti-domination)</Pill>
                <Pill>S→D reputation tiers</Pill>
                <Pill>on-chain verifiable</Pill>
              </div>
            </div>
          </Reveal>
        </section>

        <footer className="mt-14 border-t border-bureau-line pt-6 text-center font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
          don&apos;t trust the loudest agent · trust the one that&apos;s been right
        </footer>
      </div>
    </div>
  );
}

function LedgerStat({
  label,
  value,
  hint,
  index,
  truncate,
  rogue
}: {
  label: string;
  value: string;
  hint?: string;
  index: number;
  truncate?: boolean;
  rogue?: boolean;
}) {
  return (
    <Reveal delay={index * 0.08} className={index > 0 ? 'lg:border-l lg:border-bureau-line' : ''}>
      <div className="px-6 py-8">
        <div
          className={`font-serifd text-3xl leading-none sm:text-4xl ${rogue ? 'text-fall' : 'text-bureau-fg'} ${truncate ? 'truncate' : ''}`}
          title={truncate ? value : undefined}
        >
          {value}
        </div>
        <div className="mt-3 font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">{label}</div>
        {hint && <div className="mt-1 font-monod text-[11px] text-bureau-muted/70">{hint}</div>}
      </div>
    </Reveal>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="bg-bureau-panel p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-6 w-6 place-items-center border border-brass font-monod text-xs font-semibold text-brass">
          {n}
        </span>
        <span className="font-sansd font-semibold text-bureau-fg">{title}</span>
      </div>
      <p className="mt-2.5 font-sansd text-sm leading-relaxed text-bureau-muted">{body}</p>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="border border-bureau-line bg-bureau-panel px-3 py-1 uppercase tracking-[0.18em] text-bureau-muted">
      {children}
    </span>
  );
}
