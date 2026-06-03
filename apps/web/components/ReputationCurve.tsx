'use client';

import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

type Point = { window: number; cumBrier: number };

function CurveTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Point }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="glass rounded-lg px-3 py-2 font-mono text-[11px]">
      <div className="text-muted">window {p.window}</div>
      <div className="text-fg">cum Brier <span className="text-brand">{p.cumBrier.toFixed(4)}</span></div>
    </div>
  );
}

export function ReputationCurve({ data }: { data: Point[] }) {
  const last = data.length > 0 ? data[data.length - 1].cumBrier : 0;
  const first = data.length > 0 ? data[0].cumBrier : 0;
  const improving = last <= first;
  const values = data.map((d) => d.cumBrier);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const pad = Math.max((max - min) * 0.25, 0.02);
  const domain: [number, number] = [Math.max(0, min - pad), max + pad];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="glass rounded-2xl p-6"
    >
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-brand">reputation trajectory</div>
          <h3 className="mt-1 font-display text-xl font-semibold">Cumulative Brier over time</h3>
          <p className="mt-1 text-sm text-muted">Lower is better — the curve is the agent&apos;s settling calibration.</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-bold text-fg">{last.toFixed(3)}</div>
          <div className={`font-mono text-xs ${improving ? 'text-long' : 'text-short'}`}>
            {improving ? '↓ improving' : '↑ degrading'}
          </div>
        </div>
      </div>

      <div
        className="mt-5 h-64 w-full"
        role="img"
        aria-label={`Reputation trajectory: cumulative Brier score over ${data.length} windows, currently ${last.toFixed(3)}, ${improving ? 'improving' : 'degrading'}. Lower is better.`}
      >
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
              <defs>
                <linearGradient id="repFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="repStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1b2233" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="window"
                stroke="#8b93a7"
                tick={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: '#8b93a7' }}
                tickLine={false}
                axisLine={{ stroke: '#1b2233' }}
                label={{ value: 'window', position: 'insideBottomRight', offset: -2, fill: '#8b93a7', fontSize: 10 }}
              />
              <YAxis
                domain={domain}
                stroke="#8b93a7"
                tick={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: '#8b93a7' }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) => v.toFixed(2)}
              />
              <ReferenceLine y={0.25} stroke="#fbbf24" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: 'coin-flip 0.25', fill: '#fbbf24', fontSize: 10, position: 'right' }} />
              <Tooltip content={<CurveTooltip />} cursor={{ stroke: '#8b5cf6', strokeOpacity: 0.3 }} />
              <Area
                type="monotone"
                dataKey="cumBrier"
                stroke="url(#repStroke)"
                strokeWidth={2.5}
                fill="url(#repFill)"
                dot={false}
                activeDot={{ r: 4, fill: '#22d3ee', stroke: '#06070d', strokeWidth: 2 }}
                isAnimationActive
                animationDuration={900}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center font-mono text-sm text-muted">not enough windows yet</div>
        )}
      </div>
    </motion.div>
  );
}
