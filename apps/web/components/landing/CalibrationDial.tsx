'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

/**
 * A half-circle instrument gauge with a needle that sweeps to the live value.
 * Engraved style: hairline arc, scale ticks, a single brass needle — no glow.
 */
export function CalibrationDial({
  pct,
  label = 'CONFIDENCE',
  color = 'var(--color-brass)',
  width = 280
}: {
  /** 0..100 */
  pct: number;
  label?: string;
  color?: string;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-15% 0px' });
  const reduced = useReducedMotion();

  const clamped = Math.max(0, Math.min(100, pct));
  const angle = -90 + clamped * 1.8; // -90° .. +90°
  const cx = 110;
  const cy = 104;
  const R = 92;

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`${label.toLowerCase()} ${Math.round(clamped)} percent`}
      className="flex flex-col items-center"
      style={{ width }}
    >
      <svg viewBox="0 0 220 118" width={width} height={(width / 220) * 118} fill="none">
        {/* arc */}
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
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
              x1={cx + r1 * Math.sin(a)}
              y1={cy - r1 * Math.cos(a)}
              x2={cx + r2 * Math.sin(a)}
              y2={cy - r2 * Math.cos(a)}
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
              x={cx + r * Math.sin(a)}
              y={cy - r * Math.cos(a) + 4}
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
            reduced
              ? { duration: 0 }
              : { type: 'spring', stiffness: 42, damping: 14, delay: 0.25 }
          }
          style={{ originX: `${cx}px`, originY: `${cy}px` } as never}
        >
          <line x1={cx} y1={cy} x2={cx} y2={cy - R + 16} stroke={color} strokeWidth="2" />
          <circle cx={cx} cy={cy} r="4.5" fill={color} />
        </motion.g>
        <circle cx={cx} cy={cy} r="1.8" fill="var(--color-bureau)" />
      </svg>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-monod text-2xl text-bureau-fg">{Math.round(clamped)}</span>
        <span className="font-monod text-[11px] tracking-[0.2em] text-bureau-muted">
          % {label}
        </span>
      </div>
    </div>
  );
}
