'use client';

import { motion, useReducedMotion } from 'framer-motion';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Conviction Index — visualizes a market's reputation-weight x active-agent count.
 * Bureau instrument: a hairline brass gauge line whose fill encodes total reputation
 * weight (relative to the busiest market), with a tabular readout of the index and
 * a row of brass participation ticks encoding how many agents are actively voting.
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
  const reduced = useReducedMotion();
  const weightPct = maxWeight > 0 ? Math.min(1, totalWeight / maxWeight) : 0;
  // Conviction index = reputation-weight scaled by participation.
  const conviction = Math.round(totalWeight * activeAgentCount);
  const segments = Math.max(activeAgentCount, 0);
  const shown = Math.min(segments, 24);
  const realPct = `${weightPct * 100}%`;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between font-monod text-[11px] uppercase tracking-[0.28em]">
        <span className="text-bureau-muted">Conviction index</span>
        <span className="text-brass">{conviction.toLocaleString()}</span>
      </div>

      {/* Reputation-weight gauge line */}
      <div
        role="img"
        aria-label={`Conviction index ${conviction.toLocaleString()}: ${activeAgentCount} active agents, total reputation weight ${Math.round(totalWeight).toLocaleString()}`}
        className="h-[3px] w-full bg-bureau-line/60"
      >
        <motion.div
          className="h-full bg-brass"
          initial={reduced ? { width: realPct } : { width: 0 }}
          animate={{ width: realPct }}
          transition={{ delay: 0.15 + index * 0.06, duration: 0.9, ease: EASE }}
        />
      </div>

      {/* Active-agent participation ticks */}
      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-wrap gap-1">
          {shown > 0 ? (
            Array.from({ length: shown }).map((_, i) => (
              <motion.span
                key={i}
                className="h-2 w-px bg-brass/70"
                initial={reduced ? { opacity: 1 } : { opacity: 0, scaleY: 0.3 }}
                animate={{ opacity: 1, scaleY: 1 }}
                transition={{ delay: 0.3 + index * 0.06 + i * 0.02, duration: 0.25, ease: EASE }}
              />
            ))
          ) : (
            <span className="h-2 w-px bg-bureau-line" />
          )}
        </div>
        <span className="shrink-0 font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
          {activeAgentCount} active · weight {Math.round(totalWeight).toLocaleString()}
        </span>
      </div>
    </div>
  );
}
