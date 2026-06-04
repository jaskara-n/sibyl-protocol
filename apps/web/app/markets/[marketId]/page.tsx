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
import { Reveal } from '../../../components/landing/Reveal';
import { CalibrationDial } from '../../../components/landing/CalibrationDial';
import { tier } from '../../../lib/utils';

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function explorerBase(chain: ChainStatus): string {
  if (chain.explorer) return chain.explorer.replace(/\/(address|tx)\/.*/i, '');
  return 'https://explorer.sepolia.mantle.xyz';
}

function relTime(ts: number): string {
  const ms = Date.now() - ts;
  const s = Math.round(ms / 1000);
  if (s < 0) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

/** Tier letter → engraved stamp color within the bureau palette. */
function stampColor(label: string, isRogue: boolean): string {
  if (isRogue) return 'var(--color-fall)';
  if (label === 'S' || label === 'A') return 'var(--color-brass)';
  if (label === 'B') return 'var(--color-bureau-fg)';
  if (label === 'C') return 'var(--color-bureau-muted)';
  return 'var(--color-fall)';
}

/** Direction → bureau accent color var. */
function dirColor(dir: string): string {
  if (dir === 'LONG') return 'var(--color-rise)';
  if (dir === 'SHORT') return 'var(--color-fall)';
  return 'var(--color-bureau-muted)';
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

  const maxShare = Math.max(...agents.map((a) => a.weightShare), 0.0001);
  const conf = Math.max(0, Math.min(1, consensus.confidence));

  return (
    <div className="relative z-0 bg-bureau text-bureau-fg">
      <div className="mx-auto max-w-6xl px-5 pb-24">
        {/* Header */}
        <header className="relative pt-12 pb-10">
          <Link
            href="/markets"
            aria-label="Back to all markets"
            className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted transition-colors hover:text-brass"
          >
            ← all markets
          </Link>
          <p className="mt-6 font-monod text-[11px] uppercase tracking-[0.2em] text-brass">The dossier</p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <h1 className="font-serifd text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02]">
              {market?.name ?? id}
            </h1>
            <span
              title={market?.active ? 'Market is live' : 'Market is idle'}
              aria-label={market?.active ? 'Market status: live' : 'Market status: idle'}
              className={`border px-2.5 py-1 font-monod text-[11px] uppercase tracking-[0.18em] ${
                market?.active ? 'border-rise text-rise' : 'border-bureau-line text-bureau-muted'
              }`}
            >
              {market?.active ? 'live' : 'idle'}
            </span>
          </div>
          <div className="mt-2 font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">{id}</div>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Stamp>{agents.length} agents</Stamp>
            <Stamp>{activeAgentCount} active</Stamp>
            <Stamp>{sorted.length} decisions</Stamp>
            <Stamp>{onchain} on-chain</Stamp>
          </div>
        </header>

        <div className="tick-scale" aria-hidden />

        {/* Consensus + conviction */}
        <section className="mt-10 grid items-stretch gap-5 md:grid-cols-[320px_1fr]">
          <ConsensusGauge
            direction={consensus.direction}
            confidence={consensus.confidence}
            sizeBps={consensus.sizeBps}
            contributors={consensus.contributors.length}
          />
          <div className="bureau-frame flex flex-col justify-center gap-6 p-7">
            <div className="bureau-grain" aria-hidden />
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
              <div className="flex-1">
                <p className="font-monod text-[11px] uppercase tracking-[0.2em] text-brass">
                  Market conviction
                </p>
                <h2 className="mt-3 font-serifd text-[clamp(1.6rem,3vw,2.2rem)] leading-[1.05]">
                  Reputation weight × <span className="italic text-brass">participation.</span>
                </h2>
                <p className="mt-3 max-w-md font-sansd text-sm leading-relaxed text-bureau-muted">
                  The Conviction Index for this market blends the total reputation weight of its voters
                  with how many agents are actively contributing this round.
                </p>
              </div>
              <CalibrationDial pct={conf * 100} label="CONFIDENCE" width={200} />
            </div>
            <ConvictionBar
              totalWeight={totalWeight}
              activeAgentCount={activeAgentCount}
              maxWeight={maxWeight}
            />
          </div>
        </section>

        {/* Per-market leaderboard — ruled ledger */}
        <section className="mt-14">
          <div className="mb-5 flex items-end justify-between">
            <h2 className="font-serifd text-[clamp(1.4rem,2.6vw,2rem)] leading-[1.05]">
              Market leaderboard
            </h2>
            <span className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
              ranked by consensus weight
            </span>
          </div>
          {agents.length > 0 ? (
            <div className="bureau-frame overflow-hidden">
              <div className="bureau-grain" aria-hidden />
              <div className="grid grid-cols-[2.4rem_1fr_5rem] items-baseline gap-4 border-b border-bureau-line px-5 py-3 font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted sm:grid-cols-[2.4rem_1fr_5.5rem_6rem_minmax(8rem,12rem)_3.5rem]">
                <span>Nº</span>
                <span>Agent</span>
                <span className="hidden text-center sm:block">Rating</span>
                <span className="hidden text-right sm:block">Brier</span>
                <span className="text-right">Vote weight</span>
                <span className="hidden sm:block" />
              </div>

              {agents.map((a, i) => {
                const t = tier(a.brier);
                const color = stampColor(t.label, a.isRogue);
                const pct = Math.round(a.weightShare * 100);
                return (
                  <Reveal key={a.agentId} delay={i * 0.06}>
                    <Link
                      href={`/agents/${encodeURIComponent(a.agentId)}`}
                      className="group grid grid-cols-[2.4rem_1fr_5rem] items-center gap-4 border-b border-bureau-line/70 px-5 py-4 transition-colors hover:bg-bureau-fg/[0.03] sm:grid-cols-[2.4rem_1fr_5.5rem_6rem_minmax(8rem,12rem)_3.5rem]"
                    >
                      <span className="font-monod text-sm text-bureau-muted">
                        {String(i + 1).padStart(2, '0')}
                      </span>

                      <span className="min-w-0">
                        <span className="block truncate font-sansd font-semibold text-bureau-fg transition-colors group-hover:text-brass">
                          {a.agentId}
                        </span>
                        <span className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
                          {a.erc8004AgentId ? `identity Nº ${a.erc8004AgentId}` : 'unregistered'}
                          {a.isRogue && <span className="ml-2 text-fall">· silenced</span>}
                        </span>
                      </span>

                      {/* rating stamp */}
                      <span className="hidden justify-center sm:flex">
                        <span
                          title={`Reputation tier ${t.label}${a.isRogue ? ' — rogue, silenced in consensus' : ''}`}
                          aria-label={`Reputation tier ${t.label}${a.isRogue ? ', rogue, silenced in consensus' : ''}`}
                          className="grid h-9 w-9 rotate-[-4deg] place-items-center border font-serifd text-lg transition-transform group-hover:rotate-0"
                          style={{ borderColor: color, color }}
                        >
                          {a.isRogue ? '✕' : t.label}
                        </span>
                      </span>

                      <span className="hidden text-right font-monod text-sm text-bureau-muted sm:block">
                        {a.brier.toFixed(3)}
                      </span>

                      <span className="flex items-center justify-end gap-3">
                        <span
                          role="img"
                          aria-label={`Consensus vote weight ${pct} percent${a.isRogue ? ', rogue agent' : ''}`}
                          className="hidden h-[3px] w-full max-w-[8rem] bg-bureau-line/60 sm:block"
                        >
                          <span
                            className="block h-full"
                            style={{
                              width: `${(a.weightShare / maxShare) * 100}%`,
                              background: a.isRogue ? 'var(--color-fall)' : 'var(--color-brass)'
                            }}
                          />
                        </span>
                        <span className="w-10 text-right font-monod text-sm font-medium text-bureau-fg">
                          {pct}%
                        </span>
                      </span>

                      <span
                        aria-hidden
                        className="hidden text-right font-monod text-sm text-bureau-muted opacity-0 transition-all group-hover:translate-x-1 group-hover:text-brass group-hover:opacity-100 sm:block"
                      >
                        →
                      </span>
                    </Link>
                  </Reveal>
                );
              })}
            </div>
          ) : (
            <div className="bureau-frame p-6 font-sansd text-sm text-bureau-muted">
              <div className="bureau-grain" aria-hidden />
              No agents voting in this market yet — run{' '}
              <code className="font-monod text-bureau-fg">pnpm demo:seed</code>.
            </div>
          )}
        </section>

        {/* Per-market decisions — ruled ledger */}
        <section className="mt-14">
          <div className="mb-5 flex items-end justify-between">
            <h2 className="font-serifd text-[clamp(1.4rem,2.6vw,2rem)] leading-[1.05]">
              Decision history
            </h2>
            <span className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
              {sorted.length} rounds
            </span>
          </div>
          {sorted.length > 0 ? (
            <div className="bureau-frame overflow-hidden">
              <div className="bureau-grain" aria-hidden />
              {sorted.map((d, i) => {
                const dir = (d.direction || 'FLAT').toUpperCase();
                const color = dirColor(dir);
                const conf = Math.round(d.confidence * 100);
                const isNewest = i === 0;
                return (
                  <Reveal key={d.id} delay={i * 0.05}>
                    <div className="grid grid-cols-[2.4rem_1fr] items-start gap-4 border-b border-bureau-line/70 px-5 py-4 last:border-b-0 sm:grid-cols-[2.4rem_5.5rem_1fr_auto]">
                      <span className="font-monod text-sm text-bureau-muted">
                        {String(i + 1).padStart(2, '0')}
                      </span>

                      {/* Direction stamp */}
                      <span className="flex">
                        <span
                          title={`Direction: ${dir}`}
                          aria-label={`Direction: ${dir}`}
                          className="border px-2.5 py-0.5 font-monod text-[11px] uppercase tracking-[0.18em]"
                          style={{ borderColor: color, color }}
                        >
                          {dir}
                        </span>
                      </span>

                      <span className="min-w-0">
                        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="font-sansd font-semibold text-bureau-fg">{d.symbol}</span>
                          {isNewest && (
                            <span className="border border-brass px-1.5 py-0.5 font-monod text-[10px] uppercase tracking-[0.18em] text-brass">
                              latest
                            </span>
                          )}
                          <span className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
                            {relTime(d.timestamp)}
                          </span>
                        </span>
                        <span className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 font-monod text-[11px]">
                          <Metric label="size" value={`${d.sizeBps} bps`} />
                          <Metric label="confidence" value={`${conf}%`} valueStyle={{ color }} />
                          <Metric
                            label="agents"
                            value={`${d.contributors} agent${d.contributors === 1 ? '' : 's'}`}
                          />
                        </span>
                      </span>

                      <span className="font-monod text-[11px] sm:self-center sm:text-right">
                        {d.txHash ? (
                          <a
                            href={`${base}/tx/${d.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brass transition-colors hover:underline"
                          >
                            {d.txHash.slice(0, 8)}…{d.txHash.slice(-6)} ↗
                          </a>
                        ) : (
                          <span className="uppercase tracking-[0.18em] text-bureau-muted/60">off-chain</span>
                        )}
                      </span>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          ) : (
            <div className="bureau-frame p-6 font-sansd text-sm text-bureau-muted">
              <div className="bureau-grain" aria-hidden />
              No decisions recorded for this market yet.
            </div>
          )}
        </section>

        <footer className="mt-16 border-t border-bureau-line pt-6 text-center font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
          per-market reputation-weighted consensus · decisions emitted on-chain to Mantle
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

function Metric({
  label,
  value,
  valueStyle
}: {
  label: string;
  value: string;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="uppercase tracking-[0.18em] text-bureau-muted">{label}</span>
      <span className="font-medium text-bureau-fg" style={valueStyle}>
        {value}
      </span>
    </span>
  );
}
