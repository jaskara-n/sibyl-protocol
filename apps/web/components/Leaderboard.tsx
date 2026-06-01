'use client';

import { motion } from 'framer-motion';
import type { AgentRow } from '../lib/api';
import { AgentAvatar } from './AgentAvatar';
import { tier } from '../lib/utils';

export function Leaderboard({ agents }: { agents: AgentRow[] }) {
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
            className="group relative grid grid-cols-[28px_1fr_auto] items-center gap-4 rounded-xl border border-line bg-card/60 px-4 py-3 transition-colors hover:border-brand/40"
            style={a.isRogue ? { borderColor: 'rgba(255,84,112,0.35)' } : undefined}
          >
            <div className="font-mono text-sm text-muted">{i + 1}</div>

            <div className="flex items-center gap-3 min-w-0">
              <AgentAvatar id={a.agentId} ring={t.color} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-display font-semibold text-fg">{a.agentId}</span>
                  <span
                    className="grid h-5 min-w-5 place-items-center rounded px-1 font-mono text-[11px] font-bold text-ink"
                    style={{ background: t.color }}
                  >
                    {t.label}
                  </span>
                  {a.isRogue && (
                    <span className="rounded border border-short/50 px-1.5 text-[10px] font-semibold text-short">
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
              <div className="h-2 w-28 overflow-hidden rounded-full bg-ink sm:w-44">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: barColor, boxShadow: `0 0 12px ${barColor}` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(a.weightShare / max) * 100}%` }}
                  transition={{ delay: 0.2 + i * 0.07, duration: 0.9, ease: 'easeOut' }}
                />
              </div>
              <div className="w-10 text-right font-mono text-sm font-semibold text-fg">{pct}%</div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
