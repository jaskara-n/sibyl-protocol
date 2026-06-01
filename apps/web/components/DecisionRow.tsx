'use client';

import { motion } from 'framer-motion';
import type { Decision } from '../lib/api';
import { dirToken } from '../lib/utils';

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

export function DecisionRow({
  decision,
  index,
  isNewest,
  explorerBase
}: {
  decision: Decision;
  index: number;
  isNewest: boolean;
  explorerBase: string;
}) {
  const dir = (decision.direction || 'FLAT').toUpperCase();
  const tok = dirToken(dir);
  const conf = Math.round(decision.confidence * 100);
  const dotColor = dir === 'LONG' ? '#2fe3a0' : dir === 'SHORT' ? '#ff5470' : '#7c8699';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.42, ease: 'easeOut' }}
      className="relative grid grid-cols-[28px_1fr] gap-4 sm:gap-5"
    >
      {/* Timeline rail + node */}
      <div className="relative flex flex-col items-center">
        <span
          className={isNewest ? 'live-dot relative z-10 mt-5 h-3 w-3 rounded-full' : 'relative z-10 mt-5 h-3 w-3 rounded-full'}
          style={{ background: dotColor, boxShadow: `0 0 12px ${dotColor}` }}
        />
        <span className="absolute left-1/2 top-7 -z-0 h-[calc(100%+1rem)] w-px -translate-x-1/2 bg-line" />
      </div>

      {/* Card */}
      <div
        className={`group relative mb-3 rounded-2xl border border-line bg-card/60 px-4 py-3.5 transition-colors hover:border-brand/40 ${
          isNewest ? `glass ${tok.glow}` : ''
        }`}
        style={
          dir === 'LONG'
            ? { borderColor: isNewest ? 'rgba(47,227,160,0.35)' : undefined }
            : dir === 'SHORT'
            ? { borderColor: isNewest ? 'rgba(255,84,112,0.35)' : undefined }
            : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* Direction badge */}
          <span
            className={`grid h-7 place-items-center rounded-lg px-2.5 font-display text-sm font-bold text-ink ${tok.bg}`}
            style={{ boxShadow: `0 0 14px ${dotColor}55` }}
          >
            {dir}
          </span>

          <span className="font-display font-semibold text-fg">{decision.symbol}</span>

          {isNewest && (
            <span className="flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-brand">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-brand" /> latest
            </span>
          )}

          <span className="ml-auto font-mono text-xs text-muted">{relTime(decision.timestamp)}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs">
          <Metric label="size" value={`${decision.sizeBps} bps`} accent="text-fg" />
          <Metric label="confidence" value={`${conf}%`} accent={tok.color} />
          <Metric
            label="contributors"
            value={`${decision.contributors} agent${decision.contributors === 1 ? '' : 's'}`}
            accent="text-fg"
          />
          {decision.txHash ? (
            <a
              href={`${explorerBase}/tx/${decision.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-cyan hover:underline"
            >
              {decision.txHash.slice(0, 8)}…{decision.txHash.slice(-6)} ↗
            </a>
          ) : (
            <span className="ml-auto text-muted/50">off-chain</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-muted">{label}</span>
      <span className={`font-semibold ${accent}`}>{value}</span>
    </span>
  );
}
