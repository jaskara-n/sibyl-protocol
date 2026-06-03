'use client';

import { motion, useReducedMotion } from 'framer-motion';
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

const EASE = [0.22, 1, 0.36, 1] as const;

function CurveTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Point }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="border border-bureau-line bg-bureau-panel px-3 py-2 font-monod text-[11px]">
      <div className="uppercase tracking-[0.18em] text-bureau-muted">window {p.window}</div>
      <div className="text-bureau-fg">cum Brier <span className="text-brass">{p.cumBrier.toFixed(4)}</span></div>
    </div>
  );
}

export function ReputationCurve({ data }: { data: Point[] }) {
  const reduced = useReducedMotion();
  const last = data.length > 0 ? data[data.length - 1].cumBrier : 0;
  const first = data.length > 0 ? data[0].cumBrier : 0;
  const improving = last <= first;
  const values = data.map((d) => d.cumBrier);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const pad = Math.max((max - min) * 0.25, 0.02);
  const domain: [number, number] = [Math.max(0, min - pad), max + pad];
  const lineColor = improving ? 'var(--color-brass)' : 'var(--color-fall)';

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.7, ease: EASE }}
      className="bureau-frame p-6"
    >
      <div className="bureau-grain" aria-hidden />
      <div className="flex items-end justify-between">
        <div>
          <p className="font-monod text-[11px] uppercase tracking-[0.42em] text-brass">Reputation trajectory</p>
          <h3 className="mt-2 font-serifd text-xl text-bureau-fg">Cumulative Brier over time</h3>
          <p className="mt-1 font-sansd text-sm text-bureau-muted">
            Lower is better — the curve is the agent&apos;s settling calibration.
          </p>
        </div>
        <div className="text-right">
          <div className="font-serifd text-3xl text-bureau-fg">{last.toFixed(3)}</div>
          <div className={`font-monod text-[11px] uppercase tracking-[0.18em] ${improving ? 'text-rise' : 'text-fall'}`}>
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
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-bureau-line)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="window"
                stroke="var(--color-bureau-muted)"
                tick={{ fontFamily: 'var(--font-monod)', fontSize: 11, fill: 'var(--color-bureau-muted)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-bureau-line)' }}
                label={{ value: 'window', position: 'insideBottomRight', offset: -2, fill: 'var(--color-bureau-muted)', fontSize: 10 }}
              />
              <YAxis
                domain={domain}
                stroke="var(--color-bureau-muted)"
                tick={{ fontFamily: 'var(--font-monod)', fontSize: 11, fill: 'var(--color-bureau-muted)' }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) => v.toFixed(2)}
              />
              <ReferenceLine
                y={0.25}
                stroke="var(--color-bureau-muted)"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                label={{ value: 'coin-flip 0.25', fill: 'var(--color-bureau-muted)', fontSize: 10, position: 'right' }}
              />
              <Tooltip content={<CurveTooltip />} cursor={{ stroke: 'var(--color-brass)', strokeOpacity: 0.3 }} />
              <Area
                type="monotone"
                dataKey="cumBrier"
                stroke={lineColor}
                strokeWidth={2}
                fill="url(#repFill)"
                dot={false}
                activeDot={{ r: 4, fill: lineColor, stroke: 'var(--color-bureau)', strokeWidth: 2 }}
                isAnimationActive={!reduced}
                animationDuration={900}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center font-monod text-sm text-bureau-muted">
            not enough windows yet
          </div>
        )}
      </div>
    </motion.div>
  );
}
