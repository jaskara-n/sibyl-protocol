'use client';

import { motion } from 'framer-motion';
import { dirToken } from '../lib/utils';

const W = 260;
const H = 150;
const CX = W / 2;
const CY = H - 12;
const R = 104;

const COLOR: Record<string, string> = { LONG: '#2fe3a0', SHORT: '#ff5470', FLAT: '#7c8699' };

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
  const conf = Math.max(0, Math.min(1, confidence));
  const color = COLOR[direction] ?? COLOR.FLAT;
  const { glow } = dirToken(direction);
  // semicircle path, left (0%) → right (100%)
  const d = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

  return (
    <div className={`relative grid place-items-center rounded-2xl glass p-5 ${glow}`}>
      <svg width={W} height={H} className="overflow-visible">
        <defs>
          <linearGradient id="gaugegrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        {/* track */}
        <path d={d} fill="none" stroke="#1b2233" strokeWidth={14} strokeLinecap="round" />
        {/* value */}
        <motion.path
          d={d}
          fill="none"
          stroke="url(#gaugegrad)"
          strokeWidth={14}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          initial={{ strokeDashoffset: 1 }}
          animate={{ strokeDashoffset: 1 - conf }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 8px ${color})` }}
        />
        {/* 50% center tick */}
        <line x1={CX} y1={CY - R - 8} x2={CX} y2={CY - R + 8} stroke="#8b93a7" strokeWidth={2} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="font-display text-4xl font-bold tracking-tight"
          style={{ color }}
        >
          {direction}
        </motion.div>
        <div className="mt-1 font-mono text-sm text-muted">
          {Math.round(conf * 1000) / 10}% confidence · {sizeBps} bps
        </div>
        <div className="mt-0.5 text-xs text-muted/70">{contributors} agents · 50% = no edge</div>
      </div>
    </div>
  );
}
