'use client';

import { motion } from 'framer-motion';

/**
 * YES / NO implied-probability bar for a prediction market. The YES fill is the
 * FPMM `priceYES` (implied probability); the remainder is NO. Neon cosmic style,
 * matching ConvictionBar/ConsensusGauge — YES uses the `long` (green) accent and
 * NO the `short` (red) accent so direction reads at a glance.
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
      <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest">
        <span className="font-semibold text-long">
          YES {known ? `${yes.toFixed(1)}%` : '—'}
        </span>
        <span className="font-semibold text-short">
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
        className={`flex w-full overflow-hidden rounded-full bg-ink ${compact ? 'h-2' : 'h-3'}`}
      >
        <motion.div
          className="h-full bg-linear-to-r from-long/70 to-long"
          style={{ boxShadow: '0 0 12px rgba(47,227,160,0.55)' }}
          initial={{ width: 0 }}
          animate={{ width: `${yes}%` }}
          transition={{ delay: 0.1 + index * 0.05, duration: 0.9, ease: 'easeOut' }}
        />
        <motion.div
          className="h-full bg-linear-to-r from-short to-short/70"
          style={{ boxShadow: '0 0 12px rgba(255,84,112,0.5)' }}
          initial={{ width: 0 }}
          animate={{ width: `${no}%` }}
          transition={{ delay: 0.1 + index * 0.05, duration: 0.9, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
