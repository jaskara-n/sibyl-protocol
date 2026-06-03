'use client';

import { motion, useReducedMotion } from 'framer-motion';
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

const EASE = [0.22, 1, 0.36, 1] as const;

function RelTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Bucket }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  const gap = p.actual - p.predicted;
  const over = gap < 0;
  return (
    <div className="border border-bureau-line bg-bureau-panel px-3 py-2 font-monod text-[11px]">
      <div className="uppercase tracking-[0.18em] text-bureau-muted">bucket {(p.bucket * 100).toFixed(0)}% · n={p.n}</div>
      <div className="text-bureau-fg">predicted <span className="text-bureau-muted">{p.predicted.toFixed(3)}</span></div>
      <div className="text-bureau-fg">actual <span className="text-brass">{p.actual.toFixed(3)}</span></div>
      <div className={over ? 'text-fall' : 'text-rise'}>
        {over ? 'overconfident' : 'underconfident'} {Math.abs(gap).toFixed(3)}
      </div>
    </div>
  );
}

export function ReliabilityDiagram({ data }: { data: Bucket[] }) {
  const reduced = useReducedMotion();
  const diagonal = [
    { predicted: 0, actual: 0 },
    { predicted: 1, actual: 1 }
  ];
  const pts = [...data].sort((a, b) => a.predicted - b.predicted);
  const hasData = pts.length > 0;

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
          <p className="font-monod text-[11px] uppercase tracking-[0.2em] text-brass">Calibration</p>
          <h3 className="mt-2 font-serifd text-xl text-bureau-fg">Reliability diagram</h3>
          <p className="mt-1 max-w-md font-sansd text-sm text-bureau-muted">
            Predicted probability vs observed frequency. Points on the dashed{' '}
            <span className="text-bureau-fg">y = x</span> line are perfectly calibrated.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 font-monod text-[11px] uppercase tracking-[0.18em]">
          <span className="flex items-center gap-2 text-bureau-muted">
            <span className="inline-block h-2 w-2 rounded-full bg-brass" /> agent buckets
          </span>
          <span className="flex items-center gap-2 text-bureau-muted">
            <span className="inline-block h-2 w-4 border-t border-dashed border-bureau-fg/70" /> perfect calibration
          </span>
        </div>
      </div>

      <div
        className="mt-5 h-80 w-full"
        role="img"
        aria-label={
          hasData
            ? `Reliability diagram: ${pts.length} calibration buckets plotting predicted probability against observed frequency. Points on the y equals x line are perfectly calibrated; below the line is overconfident, above is underconfident.`
            : 'Reliability diagram: no calibration data yet'
        }
      >
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart margin={{ top: 12, right: 18, bottom: 28, left: 8 }}>
              <CartesianGrid stroke="var(--color-bureau-line)" strokeDasharray="2 4" />
              <XAxis
                type="number"
                dataKey="predicted"
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                stroke="var(--color-bureau-muted)"
                tick={{ fontFamily: 'var(--font-monod)', fontSize: 11, fill: 'var(--color-bureau-muted)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-bureau-line)' }}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                label={{ value: 'predicted probability', position: 'insideBottom', offset: -16, fill: 'var(--color-bureau-muted)', fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="actual"
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                stroke="var(--color-bureau-muted)"
                tick={{ fontFamily: 'var(--font-monod)', fontSize: 11, fill: 'var(--color-bureau-muted)' }}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                label={{ value: 'observed frequency', angle: -90, position: 'insideLeft', offset: 16, fill: 'var(--color-bureau-muted)', fontSize: 11, style: { textAnchor: 'middle' } }}
              />
              <ZAxis type="number" dataKey="n" range={[60, 520]} />
              <ReferenceLine
                segment={[
                  { x: 0, y: 0 },
                  { x: 1, y: 1 }
                ]}
                stroke="var(--color-bureau-fg)"
                strokeOpacity={0.55}
                strokeDasharray="5 5"
                ifOverflow="extendDomain"
              />
              <Tooltip content={<RelTooltip />} cursor={{ strokeDasharray: '3 3', stroke: 'var(--color-brass)', strokeOpacity: 0.3 }} />
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
                stroke="var(--color-brass)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={!reduced}
                animationDuration={900}
                legendType="none"
              />
              <Scatter
                data={pts}
                fill="var(--color-brass)"
                stroke="var(--color-bureau)"
                strokeWidth={1.5}
                isAnimationActive={!reduced}
                animationDuration={900}
                shape="circle"
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center font-monod text-sm text-bureau-muted">
            no calibration data yet
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 font-monod text-[11px] uppercase tracking-[0.18em] text-bureau-muted">
        <span className="border border-bureau-line bg-bureau-panel px-3 py-1">bubble size = sample count</span>
        <span className="border border-bureau-line bg-bureau-panel px-3 py-1">below line = overconfident</span>
        <span className="border border-bureau-line bg-bureau-panel px-3 py-1">above line = underconfident</span>
      </div>
    </motion.div>
  );
}
