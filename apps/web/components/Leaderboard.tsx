'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { api, type AgentRow, type Market } from '../lib/api';
import { AgentAvatar } from './AgentAvatar';
import { tier } from '../lib/utils';

const ALL = '__all__';
const EASE = [0.22, 1, 0.36, 1] as const;

/** Tier letter → engraved stamp colors within the bureau palette. */
function stampColor(label: string, isRogue: boolean): string {
  if (isRogue) return 'var(--color-fall)';
  if (label === 'S' || label === 'A') return 'var(--color-brass)';
  if (label === 'B') return 'var(--color-bureau-fg)';
  if (label === 'C') return 'var(--color-bureau-muted)';
  return 'var(--color-fall)';
}

/** Recompute weightShare within a given set of agents (normalized reputation weight). */
function withRecomputedShare(rows: AgentRow[]): AgentRow[] {
  const total = rows.reduce((s, a) => s + (a.reputationWeight ?? 0), 0);
  if (total <= 0) return rows;
  return rows.map((a) => ({ ...a, weightShare: (a.reputationWeight ?? 0) / total }));
}

function LeaderboardRows({ agents }: { agents: AgentRow[] }) {
  const reduced = useReducedMotion();
  const max = Math.max(...agents.map((a) => a.weightShare), 0.0001);

  return (
    <div className="bureau-frame overflow-hidden">
      <div className="bureau-grain" aria-hidden />

      <div className="grid grid-cols-[2.4rem_1fr_5rem] items-baseline gap-4 border-b border-bureau-line px-5 py-3 font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted sm:grid-cols-[2.4rem_1fr_4.5rem_minmax(8rem,12rem)_3.5rem]">
        <span>Nº</span>
        <span>Agent</span>
        <span className="hidden text-center sm:block">Rating</span>
        <span className="text-right">Vote weight</span>
        <span className="hidden sm:block" />
      </div>

      {agents.map((a, i) => {
        const t = tier(a.brier);
        const color = stampColor(t.label, a.isRogue);
        const pct = Math.round(a.weightShare * 100);
        return (
          <motion.div
            key={a.agentId}
            initial={reduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.5, ease: EASE }}
          >
            <Link
              href={`/agents/${encodeURIComponent(a.agentId)}`}
              className="group grid grid-cols-[2.4rem_1fr_5rem] items-center gap-4 border-b border-bureau-line/70 px-5 py-4 transition-colors hover:bg-bureau-fg/[0.03] sm:grid-cols-[2.4rem_1fr_4.5rem_minmax(8rem,12rem)_3.5rem]"
            >
              <span className="font-monod text-sm text-bureau-muted">{String(i + 1).padStart(2, '0')}</span>

              <div className="flex min-w-0 items-center gap-3">
                <AgentAvatar id={a.agentId} ring={color} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-sansd font-semibold text-bureau-fg transition-colors group-hover:text-brass">
                      {a.agentId}
                    </span>
                    {a.isRogue && (
                      <span
                        title="Flagged as rogue: silenced in consensus"
                        aria-label="Flagged as rogue: silenced in consensus"
                        className="border border-fall px-2 py-0.5 font-monod text-[11px] uppercase tracking-[0.18em] text-fall"
                      >
                        Rogue
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
                    <span>Brier {a.brier.toFixed(3)}</span>
                    {a.erc8004AgentId ? (
                      <span className="text-brass">identity Nº {a.erc8004AgentId}</span>
                    ) : (
                      <span className="text-bureau-muted/60">unregistered</span>
                    )}
                  </div>
                </div>
              </div>

              {/* rating stamp */}
              <span className="hidden justify-center sm:flex">
                <span
                  title={`Calibration rating ${t.label}${a.isRogue ? ' — rogue, silenced in consensus' : ''}`}
                  aria-label={`Calibration rating ${t.label}${a.isRogue ? ', rogue, silenced in consensus' : ''}`}
                  className="grid h-9 w-9 rotate-[-4deg] place-items-center border font-serifd text-lg transition-transform group-hover:rotate-0"
                  style={{ borderColor: color, color }}
                >
                  {a.isRogue ? '✕' : t.label}
                </span>
              </span>

              <span className="flex items-center justify-end gap-3">
                <span
                  role="img"
                  aria-label={`Consensus vote weight ${pct} percent${a.isRogue ? ', rogue agent' : ''}`}
                  className="hidden h-[3px] w-full max-w-[8rem] bg-bureau-line/60 sm:block"
                >
                  <motion.span
                    className="block h-full"
                    style={{ background: a.isRogue ? 'var(--color-fall)' : 'var(--color-brass)' }}
                    initial={reduced ? { width: `${(a.weightShare / max) * 100}%` } : { width: 0 }}
                    animate={{ width: `${(a.weightShare / max) * 100}%` }}
                    transition={{ delay: 0.2 + i * 0.07, duration: 0.9, ease: EASE }}
                  />
                </span>
                <span className="w-10 text-right font-monod text-sm font-medium text-bureau-fg">{pct}%</span>
              </span>

              <span
                aria-hidden
                className="hidden text-right font-monod text-sm text-bureau-muted opacity-0 transition-all group-hover:translate-x-1 group-hover:text-brass group-hover:opacity-100 sm:block"
              >
                →
              </span>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}

/**
 * Leaderboard.
 * - Without `markets`: renders the provided `agents` exactly as given (per-market pages pass pre-filtered rows).
 * - With `markets`: renders a market selector that re-fetches `GET /agents?marketId=` and recomputes
 *   per-market weightShare. The default "all markets" option uses the aggregate `agents` prop.
 */
export function Leaderboard({ agents, markets }: { agents: AgentRow[]; markets?: Market[] }) {
  const [selected, setSelected] = useState<string>(ALL);
  const [rows, setRows] = useState<AgentRow[]>(agents);
  const [loading, setLoading] = useState(false);

  // Keep aggregate in sync if the prop changes (e.g. parent re-renders with fresh data).
  useEffect(() => {
    if (selected === ALL) setRows(agents);
  }, [agents, selected]);

  useEffect(() => {
    if (!markets || selected === ALL) return;
    let cancelled = false;
    setLoading(true);
    api<AgentRow[]>(`/agents?marketId=${encodeURIComponent(selected)}`, [])
      .then((fetched) => {
        if (cancelled) return;
        const ranked = [...withRecomputedShare(fetched)].sort((a, b) => b.weightShare - a.weightShare);
        setRows(ranked);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [markets, selected]);

  const display = useMemo(() => rows, [rows]);

  if (!markets) {
    return <LeaderboardRows agents={agents} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <label htmlFor="lb-market" className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
          market
        </label>
        <div className="relative">
          <select
            id="lb-market"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="appearance-none border border-bureau-line bg-bureau-panel py-2 pl-3 pr-9 font-monod text-sm text-bureau-fg outline-none transition-colors hover:border-brass focus:border-brass"
          >
            <option value={ALL}>all markets (aggregate)</option>
            {markets.map((m) => (
              <option key={m.marketId} value={m.marketId}>
                {m.name ?? m.marketId}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-monod text-xs text-bureau-muted">
            ▾
          </span>
        </div>
        {loading && (
          <span role="status" aria-live="polite" className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
            loading…
          </span>
        )}
      </div>

      {display.length > 0 ? (
        <LeaderboardRows agents={display} />
      ) : (
        <div className="bureau-frame p-6 font-monod text-sm text-bureau-muted">
          <div className="bureau-grain" aria-hidden />
          {loading ? 'loading agents…' : 'no agents voting in this market yet.'}
        </div>
      )}
    </div>
  );
}
