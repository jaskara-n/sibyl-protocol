'use client';

import { motion } from 'framer-motion';

/**
 * YES / NO implied-probability scale for a prediction market. The YES fill is the
 * FPMM `priceYES` (implied probability); the remainder is NO. Bureau styling — a
 * square hairline scale, YES on the `rise` accent and NO on the `fall` accent so
 * direction reads at a glance. Mono tabular percentage labels.
 */
export function ProbabilityBar({
  yesPct,
  index = 0,
  compact = false
}: {
  /** YES probability as a 0..100 percent number (may be null when unknown). */
  yesPct: number | null;
  index?: number;
  compact?: boolean;
}) {
  const known = typeof yesPct === 'number' && Number.isFinite(yesPct);
  const yes = known ? Math.max(0, Math.min(100, yesPct as number)) : 50;
  const no = 100 - yes;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between font-monod text-[11px] uppercase tracking-[0.18em]">
        <span className="font-semibold text-rise">
          YES {known ? `${yes.toFixed(1)}%` : '—'}
        </span>
        <span className="font-semibold text-fall">
          NO {known ? `${no.toFixed(1)}%` : '—'}
        </span>
      </div>

      <div
        role="img"
        aria-label={
          known
            ? `Implied probability: YES ${yes.toFixed(1)}%, NO ${no.toFixed(1)}%`
            : 'Implied probability unknown'
        }
        className={`flex w-full overflow-hidden border border-bureau-line bg-bureau ${compact ? 'h-2' : 'h-3'}`}
      >
        <motion.div
          className="h-full bg-rise"
          initial={{ width: 0 }}
          animate={{ width: `${yes}%` }}
          transition={{ delay: 0.1 + index * 0.05, duration: 0.9, ease: 'easeOut' }}
        />
        <motion.div
          className="h-full bg-fall"
          initial={{ width: 0 }}
          animate={{ width: `${no}%` }}
          transition={{ delay: 0.1 + index * 0.05, duration: 0.9, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
