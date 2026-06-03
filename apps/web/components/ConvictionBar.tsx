'use client';

import { motion } from 'framer-motion';

/**
 * Conviction Index — visualizes a market's reputation-weight x active-agent count.
 * The bar fill encodes total reputation weight (relative to the busiest market),
 * and the segment count encodes how many agents are actively voting.
 */
export function ConvictionBar({
  totalWeight,
  activeAgentCount,
  maxWeight,
  index = 0
}: {
  totalWeight: number;
  activeAgentCount: number;
  maxWeight: number;
  index?: number;
}) {
  const weightPct = maxWeight > 0 ? Math.min(1, totalWeight / maxWeight) : 0;
  // Conviction index = reputation-weight scaled by participation.
  const conviction = Math.round(totalWeight * activeAgentCount);
  const segments = Math.max(activeAgentCount, 0);
  const shown = Math.min(segments, 24);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-muted">
        <span>conviction index</span>
        <span className="font-semibold text-brand">{conviction.toLocaleString()}</span>
      </div>

      {/* Reputation-weight bar */}
      <div
        role="img"
        aria-label={`Conviction index ${conviction.toLocaleString()}: ${activeAgentCount} active agents, total reputation weight ${Math.round(totalWeight).toLocaleString()}`}
        className="h-2.5 w-full overflow-hidden rounded-full bg-ink"
      >
        <motion.div
          className="h-full rounded-full bg-linear-to-r from-brand to-cyan"
          style={{ boxShadow: '0 0 12px rgba(139,92,246,0.6)' }}
          initial={{ width: 0 }}
          animate={{ width: `${weightPct * 100}%` }}
          transition={{ delay: 0.15 + index * 0.06, duration: 0.9, ease: 'easeOut' }}
        />
      </div>

      {/* Active-agent participation segments */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 flex-wrap gap-1">
          {shown > 0 ? (
            Array.from({ length: shown }).map((_, i) => (
              <motion.span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-cyan/80"
                style={{ boxShadow: '0 0 6px rgba(34,211,238,0.7)' }}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + index * 0.06 + i * 0.02, duration: 0.25 }}
              />
            ))
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-line" />
          )}
        </div>
        <span className="shrink-0 font-mono text-[11px] text-muted">
          {activeAgentCount} active · weight {Math.round(totalWeight).toLocaleString()}
        </span>
      </div>
    </div>
  );
}
