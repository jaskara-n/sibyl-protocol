'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { api, type AgentRow, type Market } from '../lib/api';
import { AgentAvatar } from './AgentAvatar';
import { tier } from '../lib/utils';

const ALL = '__all__';

/** Recompute weightShare within a given set of agents (normalized reputation weight). */
function withRecomputedShare(rows: AgentRow[]): AgentRow[] {
  const total = rows.reduce((s, a) => s + (a.reputationWeight ?? 0), 0);
  if (total <= 0) return rows;
  return rows.map((a) => ({ ...a, weightShare: (a.reputationWeight ?? 0) / total }));
}

function LeaderboardRows({ agents }: { agents: AgentRow[] }) {
  const max = Math.max(...agents.map((a) => a.weightShare), 0.0001);

  return (
    <div className="flex flex-col gap-2">
      {agents.map((a, i) => {
        const t = tier(a.brier);
        const pct = Math.round(a.weightShare * 100);
        const barColor = a.isRogue ? '#ff5470' : '#8b5cf6';
        return (
          <motion.div
            key={a.agentId}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.4, ease: 'easeOut' }}
          >
            <Link
              href={`/agents/${encodeURIComponent(a.agentId)}`}
              className="group relative grid grid-cols-[28px_1fr_auto] items-center gap-4 rounded-xl border border-line bg-card/60 px-4 py-3 transition-all hover:border-brand/40 hover:bg-card/90 hover:shadow-[0_0_30px_-12px_rgba(139,92,246,0.6)]"
              style={a.isRogue ? { borderColor: 'rgba(255,84,112,0.35)' } : undefined}
            >
              <div className="font-mono text-sm text-muted">{i + 1}</div>

              <div className="flex items-center gap-3 min-w-0">
                <AgentAvatar id={a.agentId} ring={t.color} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display font-semibold text-fg transition-colors group-hover:text-brand">
                      {a.agentId}
                    </span>
                    <span
                      title={`Reputation tier ${t.label}`}
                      aria-label={`Reputation tier ${t.label}`}
                      className="grid h-5 min-w-5 place-items-center rounded px-1 font-mono text-[11px] font-bold text-ink"
                      style={{ background: t.color }}
                    >
                      {t.label}
                    </span>
                    {a.isRogue && (
                      <span
                        title="Flagged as rogue: silenced in consensus"
                        aria-label="Flagged as rogue: silenced in consensus"
                        className="rounded border border-short/50 px-1.5 text-[10px] font-semibold text-short"
                      >
                        ROGUE
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 font-mono text-[11px] text-muted">
                    <span>Brier {a.brier.toFixed(3)}</span>
                    {a.erc8004AgentId ? (
                      <span className="text-cyan/80">ERC-8004 #{a.erc8004AgentId}</span>
                    ) : (
                      <span className="text-muted/50">unregistered</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div
                  role="img"
                  aria-label={`Consensus vote weight ${pct}%${a.isRogue ? ', rogue agent' : ''}`}
                  className="h-2 w-28 overflow-hidden rounded-full bg-ink sm:w-44"
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: barColor, boxShadow: `0 0 12px ${barColor}` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(a.weightShare / max) * 100}%` }}
                    transition={{ delay: 0.2 + i * 0.07, duration: 0.9, ease: 'easeOut' }}
                  />
                </div>
                <div className="w-10 text-right font-mono text-sm font-semibold text-fg">{pct}%</div>
                <span className="hidden font-mono text-sm text-muted opacity-0 transition-all group-hover:translate-x-0.5 group-hover:text-brand group-hover:opacity-100 sm:inline">
                  →
                </span>
              </div>
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
        <label htmlFor="lb-market" className="font-mono text-xs uppercase tracking-widest text-muted">
          market
        </label>
        <div className="relative">
          <select
            id="lb-market"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="appearance-none rounded-lg border border-line bg-card/80 py-2 pl-3 pr-9 font-mono text-sm text-fg outline-none transition-colors hover:border-brand/50 focus:border-brand"
          >
            <option value={ALL}>all markets (aggregate)</option>
            {markets.map((m) => (
              <option key={m.marketId} value={m.marketId}>
                {m.name ?? m.marketId}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">
            ▾
          </span>
        </div>
        {loading && (
          <span role="status" aria-live="polite" className="font-mono text-xs text-muted">
            loading…
          </span>
        )}
      </div>

      {display.length > 0 ? (
        <LeaderboardRows agents={display} />
      ) : (
        <div className="glass rounded-xl p-6 font-mono text-sm text-muted">
          {loading ? 'loading agents…' : 'no agents voting in this market yet.'}
        </div>
      )}
    </div>
  );
}
