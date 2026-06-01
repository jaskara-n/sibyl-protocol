'use client';

import { motion } from 'framer-motion';
import {
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ComposedChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis
} from 'recharts';

type Bucket = { bucket: number; predicted: number; actual: number; n: number };

function RelTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Bucket }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  const gap = p.actual - p.predicted;
  const over = gap < 0;
  return (
    <div className="glass rounded-lg px-3 py-2 font-mono text-[11px]">
      <div className="text-muted">bucket {(p.bucket * 100).toFixed(0)}% · n={p.n}</div>
      <div className="text-fg">predicted <span className="text-cyan">{p.predicted.toFixed(3)}</span></div>
      <div className="text-fg">actual <span className="text-brand">{p.actual.toFixed(3)}</span></div>
      <div className={over ? 'text-short' : 'text-long'}>
        {over ? 'overconfident' : 'underconfident'} {Math.abs(gap).toFixed(3)}
      </div>
    </div>
  );
}

export function ReliabilityDiagram({ data }: { data: Bucket[] }) {
  const diagonal = [
    { predicted: 0, actual: 0 },
    { predicted: 1, actual: 1 }
  ];
  const pts = [...data].sort((a, b) => a.predicted - b.predicted);
  const hasData = pts.length > 0;

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
          <div className="text-xs uppercase tracking-widest text-cyan">calibration</div>
          <h3 className="mt-1 font-display text-xl font-semibold">Reliability diagram</h3>
          <p className="mt-1 max-w-md text-sm text-muted">
            Predicted probability vs observed frequency. Points on the dashed{' '}
            <span className="text-fg">y = x</span> line are perfectly calibrated.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 font-mono text-[11px]">
          <span className="flex items-center gap-2 text-muted">
            <span className="inline-block h-2 w-2 rounded-full bg-brand" /> agent buckets
          </span>
          <span className="flex items-center gap-2 text-muted">
            <span className="inline-block h-2 w-4 border-t border-dashed border-fg/70" /> perfect calibration
          </span>
        </div>
      </div>

      <div className="mt-5 h-80 w-full">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart margin={{ top: 12, right: 18, bottom: 28, left: 8 }}>
              <defs>
                <linearGradient id="relStroke" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1b2233" strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="predicted"
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                stroke="#8b93a7"
                tick={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: '#8b93a7' }}
                tickLine={false}
                axisLine={{ stroke: '#1b2233' }}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                label={{ value: 'predicted probability', position: 'insideBottom', offset: -16, fill: '#8b93a7', fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="actual"
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                stroke="#8b93a7"
                tick={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: '#8b93a7' }}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                label={{ value: 'observed frequency', angle: -90, position: 'insideLeft', offset: 16, fill: '#8b93a7', fontSize: 11, style: { textAnchor: 'middle' } }}
              />
              <ZAxis type="number" dataKey="n" range={[60, 520]} />
              <ReferenceLine
                segment={[
                  { x: 0, y: 0 },
                  { x: 1, y: 1 }
                ]}
                stroke="#e9edf6"
                strokeOpacity={0.55}
                strokeDasharray="5 5"
                ifOverflow="extendDomain"
              />
              <Tooltip content={<RelTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#8b5cf6', strokeOpacity: 0.3 }} />
              <Line
                data={diagonal}
                dataKey="actual"
                stroke="transparent"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                legendType="none"
              />
              <Line
                type="monotone"
                data={pts}
                dataKey="actual"
                stroke="url(#relStroke)"
                strokeWidth={2}
                dot={false}
                isAnimationActive
                animationDuration={900}
                legendType="none"
              />
              <Scatter
                data={pts}
                fill="#8b5cf6"
                stroke="#06070d"
                strokeWidth={1.5}
                isAnimationActive
                animationDuration={900}
                shape="circle"
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center font-mono text-sm text-muted">no calibration data yet</div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted">
        <span className="rounded-full border border-line bg-card/60 px-3 py-1">bubble size = sample count</span>
        <span className="rounded-full border border-line bg-card/60 px-3 py-1">below line = overconfident</span>
        <span className="rounded-full border border-line bg-card/60 px-3 py-1">above line = underconfident</span>
      </div>
    </motion.div>
  );
}
