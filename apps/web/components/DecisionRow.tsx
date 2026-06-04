'use client';

import { motion } from 'framer-motion';
import type { Decision } from '../lib/api';

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
  // the frozen replay's deterministic windows carry archival timestamps —
  // "20588d ago" reads like a bug; name it what it is
  if (d > 365) return 'replay archive';
  return `${d}d ago`;
}

function absTime(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}

export function DecisionRow({
  decision,
  index,
  isNewest,
  explorerBase,
  isLast
}: {
  decision: Decision;
  index: number;
  isNewest: boolean;
  explorerBase: string;
  isLast?: boolean;
}) {
  const dir = (decision.direction || 'FLAT').toUpperCase();
  const conf = Math.round(decision.confidence * 100);
  const stampColor = dir === 'LONG' ? 'var(--color-rise)' : dir === 'SHORT' ? 'var(--color-fall)' : 'var(--color-bureau-muted)';
  const accent = dir === 'LONG' ? 'text-rise' : dir === 'SHORT' ? 'text-fall' : 'text-bureau-muted';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4, ease: 'easeOut' }}
      className={`group relative grid grid-cols-[auto_1fr] gap-4 px-5 py-4 transition-colors hover:bg-bureau-fg/[0.03] sm:gap-5 ${
        isLast ? '' : 'border-b border-bureau-line/70'
      }`}
    >
      {/* Direction stamp + node */}
      <div className="flex flex-col items-center gap-2 pt-0.5">
        <span
          title={`Direction: ${dir}`}
          aria-label={`Direction: ${dir}`}
          className="grid h-9 w-[3.6rem] place-items-center border font-monod text-[11px] uppercase tracking-[0.18em]"
          style={{ borderColor: stampColor, color: stampColor }}
        >
          {dir}
        </span>
        {isNewest && (
          <span
            aria-hidden
            className="live-dot h-2 w-2 rounded-full"
            style={{ background: stampColor, boxShadow: `0 0 8px ${stampColor}` }}
          />
        )}
      </div>

      {/* Entry body */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-sansd font-semibold text-bureau-fg">{decision.symbol}</span>

          {isNewest && (
            <span
              aria-label="Latest decision"
              className="border border-brass px-2 py-0.5 font-monod text-[10px] uppercase tracking-[0.18em] text-brass"
            >
              latest
            </span>
          )}

          <span
            className="ml-auto font-monod text-[11px] text-bureau-muted"
            title={absTime(decision.timestamp)}
          >
            {relTime(decision.timestamp)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-monod text-xs">
          <Metric label="size" value={`${decision.sizeBps} bps`} accent="text-bureau-fg" />
          <Metric label="confidence" value={`${conf}%`} accent={accent} />
          <Metric
            label="contributors"
            value={`${decision.contributors} agent${decision.contributors === 1 ? '' : 's'}`}
            accent="text-bureau-fg"
          />
          {decision.txHash ? (
            <a
              href={`${explorerBase}/tx/${decision.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-brass hover:underline"
            >
              {decision.txHash.slice(0, 8)}…{decision.txHash.slice(-6)} ↗
            </a>
          ) : (
            <span className="ml-auto text-bureau-muted/50">off-chain</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="uppercase tracking-[0.14em] text-bureau-muted">{label}</span>
      <span className={`font-medium ${accent}`}>{value}</span>
    </span>
  );
}
