'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

const W = 220;
const H = 118;
const CX = 110;
const CY = 104;
const R = 92;

/** Direction → bureau accent (brass for FLAT, phosphor rise / vermilion fall). */
const COLOR: Record<string, string> = {
  LONG: 'var(--color-rise)',
  SHORT: 'var(--color-fall)',
  FLAT: 'var(--color-brass)'
};

/**
 * Consensus instrument — an engraved half-circle dial in the bureau language:
 * hairline arc, brass scale ticks, a single needle sweeping to live confidence,
 * the direction set in serif. No glow. Mirrors HeroAct's live instrument.
 */
export function ConsensusGauge({
  direction,
  confidence,
  sizeBps,
  contributors
}: {
  direction: string;
  confidence: number;
  sizeBps: number;
  contributors: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-15% 0px' });
  const reduced = useReducedMotion();

  const conf = Math.max(0, Math.min(1, confidence));
  const pct = Math.round(conf * 1000) / 10;
  const color = COLOR[direction] ?? COLOR.FLAT;
  const angle = -90 + conf * 180; // -90° .. +90°

  const gaugeLabel = `Consensus ${direction}, ${pct}% confidence, size ${sizeBps} bps, ${contributors} contributing agents`;

  return (
    <div ref={ref} className="bureau-frame flex flex-col items-center justify-center p-6">
      <div className="bureau-grain" aria-hidden />
      <div className="flex w-full items-baseline justify-between border-b border-bureau-line pb-3">
        <span className="font-monod text-[10px] uppercase tracking-[0.32em] text-bureau-muted">
          Consensus · live
        </span>
        <span className="font-monod text-[10px] uppercase tracking-[0.32em] text-brass">
          50% = no edge
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        fill="none"
        className="mt-5"
        role="img"
        aria-label={gaugeLabel}
      >
        <title>{gaugeLabel}</title>
        {/* arc */}
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          stroke="var(--color-bureau-line)"
          strokeWidth="1.5"
        />
        {/* scale ticks every 5%, majors every 25% */}
        {Array.from({ length: 21 }).map((_, i) => {
          const a = (-90 + i * 9) * (Math.PI / 180);
          const major = i % 5 === 0;
          const r1 = R;
          const r2 = R - (major ? 12 : 6);
          return (
            <line
              key={i}
              x1={CX + r1 * Math.sin(a)}
              y1={CY - r1 * Math.cos(a)}
              x2={CX + r2 * Math.sin(a)}
              y2={CY - r2 * Math.cos(a)}
              stroke={major ? 'var(--color-brass)' : 'var(--color-bureau-line)'}
              strokeOpacity={major ? 0.7 : 1}
              strokeWidth={major ? 1.5 : 1}
            />
          );
        })}
        {/* scale numerals */}
        {[0, 50, 100].map((v) => {
          const a = (-90 + v * 1.8) * (Math.PI / 180);
          const r = R - 24;
          return (
            <text
              key={v}
              x={CX + r * Math.sin(a)}
              y={CY - r * Math.cos(a) + 4}
              textAnchor="middle"
              fontSize="9"
              fill="var(--color-bureau-muted)"
              style={{ fontFamily: 'var(--font-monod)' }}
            >
              {v}
            </text>
          );
        })}
        {/* needle */}
        <motion.g
          initial={false}
          animate={inView ? { rotate: angle } : { rotate: reduced ? angle : -90 }}
          transition={
            reduced ? { duration: 0 } : { type: 'spring', stiffness: 42, damping: 14, delay: 0.25 }
          }
          style={{ originX: `${CX}px`, originY: `${CY}px` } as never}
        >
          <line x1={CX} y1={CY} x2={CX} y2={CY - R + 16} stroke={color} strokeWidth="2" />
          <circle cx={CX} cy={CY} r="4.5" fill={color} />
        </motion.g>
        <circle cx={CX} cy={CY} r="1.8" fill="var(--color-bureau)" />
      </svg>

      <div className="mt-1 flex flex-col items-center">
        <div className="font-serifd text-4xl leading-none" style={{ color }}>
          {direction}
        </div>
        <div className="mt-2 font-monod text-sm text-bureau-fg">
          {pct}% confidence · {sizeBps} bps
        </div>
        <div className="mt-0.5 font-monod text-[10px] uppercase tracking-[0.2em] text-bureau-muted">
          {contributors} agents contributing
        </div>
      </div>
    </div>
  );
}
