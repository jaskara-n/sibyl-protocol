'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import type { AgentRow } from '../../lib/api';
import { tier } from '../../lib/utils';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Tier letter → engraved stamp colors within the bureau palette. */
function stampColor(label: string, isRogue: boolean): string {
  if (isRogue) return 'var(--color-fall)';
  if (label === 'S' || label === 'A') return 'var(--color-brass)';
  if (label === 'B') return 'var(--color-bureau-fg)';
  if (label === 'C') return 'var(--color-bureau-muted)';
  return 'var(--color-fall)';
}

/**
 * The registry — the leaderboard set like an official ratings ledger:
 * ruled rows, stamped ratings, tabular numerals. Live data.
 */
export function RegistryTable({ agents }: { agents: AgentRow[] }) {
  const reduced = useReducedMotion();
  const rows = agents.slice(0, 6);
  const maxShare = Math.max(...rows.map((a) => a.weightShare), 0.0001);

  if (rows.length === 0) {
    return (
      <div className="bureau-frame p-10 text-center">
        <div className="bureau-grain" aria-hidden />
        <p className="font-serifd text-2xl italic text-bureau-muted">
          The registry awaits its first scored prediction.
        </p>
      </div>
    );
  }

  return (
    <div className="bureau-frame overflow-hidden">
      <div className="bureau-grain" aria-hidden />

      <div className="grid grid-cols-[2.4rem_1fr_5rem] items-baseline gap-4 border-b border-bureau-line px-5 py-3 font-monod text-[11px] uppercase tracking-[0.3em] text-bureau-muted sm:grid-cols-[2.4rem_1fr_5.5rem_6rem_minmax(8rem,12rem)_3.5rem]">
        <span>Nº</span>
        <span>Agent</span>
        <span className="hidden text-center sm:block">Rating</span>
        <span className="hidden text-right sm:block">Brier</span>
        <span className="text-right">Vote weight</span>
        <span className="hidden sm:block" />
      </div>

      {rows.map((a, i) => {
        const t = tier(a.brier);
        const color = stampColor(t.label, a.isRogue);
        const pct = Math.round(a.weightShare * 100);
        return (
          <motion.div
            key={a.agentId}
            initial={reduced ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-8% 0px' }}
            transition={{ delay: i * 0.08, duration: 0.7, ease: EASE }}
          >
            <Link
              href={`/agents/${encodeURIComponent(a.agentId)}`}
              className="group grid grid-cols-[2.4rem_1fr_5rem] items-center gap-4 border-b border-bureau-line/70 px-5 py-4 transition-colors hover:bg-bureau-fg/[0.03] sm:grid-cols-[2.4rem_1fr_5.5rem_6rem_minmax(8rem,12rem)_3.5rem]"
            >
              <span className="font-monod text-sm text-bureau-muted">{String(i + 1).padStart(2, '0')}</span>

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
                  title={`Calibration rating ${t.label}${a.isRogue ? ' — rogue, silenced in consensus' : ''}`}
                  aria-label={`Calibration rating ${t.label}${a.isRogue ? ', rogue, silenced in consensus' : ''}`}
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
                  aria-label={`Vote weight ${pct} percent`}
                  className="hidden h-[3px] w-full max-w-[8rem] bg-bureau-line/60 sm:block"
                >
                  <motion.span
                    className="block h-full"
                    style={{ background: a.isRogue ? 'var(--color-fall)' : 'var(--color-brass)' }}
                    initial={reduced ? { width: `${(a.weightShare / maxShare) * 100}%` } : { width: 0 }}
                    whileInView={{ width: `${(a.weightShare / maxShare) * 100}%` }}
                    viewport={{ once: true, margin: '-8% 0px' }}
                    transition={{ delay: 0.25 + i * 0.08, duration: 0.9, ease: EASE }}
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

      <div className="flex justify-end px-5 py-4">
        <Link
          href="/agents"
          className="group inline-flex items-center gap-2 font-monod text-[11px] uppercase tracking-[0.3em] text-bureau-muted transition-colors hover:text-brass"
        >
          Open the full registry
          <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
        </Link>
      </div>
    </div>
  );
}
