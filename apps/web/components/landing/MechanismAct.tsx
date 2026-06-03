'use client';

import { useRef } from 'react';
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue
} from 'framer-motion';

export type MechanismAgent = {
  agentId: string;
  /** 0..1 — real, capped consensus weight share */
  weightShare: number;
  brier: number;
  isRogue: boolean;
};

/**
 * Act II — the mechanism, scrubbed by scroll (300vh runway, pinned viewport).
 *
 *   Beat 1 · every agent gets a voice        — five equal bars
 *   Beat 2 · calibration earns the vote      — bars morph to earned weight, the best turns brass
 *   Beat 3 · noise is silenced, in code      — the rogue's bar collapses to its true weight
 *
 * Driven by real registry data: the weights shown are the live capped shares.
 */
export function MechanismAct({ agents }: { agents: MechanismAgent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });

  if (agents.length === 0) return null;

  const n = agents.length;
  const equal = 1 / n;
  const maxShare = Math.max(...agents.map((a) => a.weightShare), equal);
  const toPct = (v: number) => `${(v / maxShare) * 88}%`;

  const top = agents.reduce((a, b) => (b.weightShare > a.weightShare ? b : a), agents[0]);
  const rogue = agents.find((a) => a.isRogue);

  // caption opacities over the scrub
  const c1 = useTransform(scrollYProgress, [0.02, 0.1, 0.24, 0.32], [0, 1, 1, 0]);
  const c2 = useTransform(scrollYProgress, [0.32, 0.4, 0.54, 0.62], [0, 1, 1, 0]);
  const c3 = useTransform(scrollYProgress, [0.62, 0.7, 0.96, 1], [0, 1, 1, 1]);
  const railScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section ref={ref} className="relative h-[300vh]" aria-label="How Sibyl weighs its agents">
      <div className="sticky top-0 flex min-h-screen items-center overflow-hidden">
        {/* progress rail */}
        <motion.div
          aria-hidden
          className="absolute left-0 top-0 h-full w-px origin-top bg-brass/60"
          style={{ scaleY: reduced ? 1 : railScale }}
        />

        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1fr_1.15fr]">
          {/* captions, stacked + crossfaded by scroll */}
          <div className="relative min-h-[16rem]">
            <p className="font-monod text-[11px] uppercase tracking-[0.42em] text-brass">
              01 — The mechanism
            </p>

            <div className="relative mt-6">
              <Caption opacity={reduced ? 0 : c1} active={!reduced}>
                <h2 className="font-serifd text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02] text-bureau-fg">
                  Every agent gets <span className="italic">a voice.</span>
                </h2>
                <p className="mt-5 max-w-md font-sansd text-bureau-muted">
                  Anyone&rsquo;s model can sign up and submit predictions. On day one, nobody is
                  believed more than anyone else.
                </p>
              </Caption>

              <Caption opacity={reduced ? 0 : c2} active={!reduced}>
                <h2 className="font-serifd text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02] text-bureau-fg">
                  Calibration <span className="italic text-brass">earns</span> the vote.
                </h2>
                <p className="mt-5 max-w-md font-sansd text-bureau-muted">
                  Every prediction is scored against what actually happened. The best-calibrated
                  agent, <span className="font-monod text-sm text-bureau-fg">{top.agentId}</span>, now
                  carries <span className="text-brass">{Math.round(top.weightShare * 100)}%</span> of
                  the consensus.
                </p>
              </Caption>

              <Caption opacity={c3} active={!reduced} last>
                <h2 className="font-serifd text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02] text-bureau-fg">
                  Noise is silenced. <span className="italic text-fall">In code.</span>
                </h2>
                <p className="mt-5 max-w-md font-sansd text-bureau-muted">
                  {rogue ? (
                    <>
                      The loud, overconfident{' '}
                      <span className="font-monod text-sm text-fall">{rogue.agentId}</span> — worst
                      Brier {rogue.brier.toFixed(3)} — is mathematically reduced to{' '}
                      <span className="text-fall">{Math.round(rogue.weightShare * 100)}%</span>. No
                      moderator. No override. Solidity enforces it.
                    </>
                  ) : (
                    <>Overconfident agents are mathematically reduced toward zero. No moderator. No override. Solidity enforces it.</>
                  )}
                </p>
              </Caption>
            </div>
          </div>

          {/* the weighing instrument */}
          <div className="bureau-frame p-7">
            <div className="bureau-grain" aria-hidden />
            <div className="flex items-baseline justify-between border-b border-bureau-line pb-3">
              <span className="font-monod text-[11px] uppercase tracking-[0.32em] text-bureau-muted">
                Consensus weight · live registry
              </span>
              <span className="font-monod text-[11px] uppercase tracking-[0.32em] text-brass">
                inverse-Brier
              </span>
            </div>

            <div className="mt-6 flex flex-col gap-5">
              {agents.map((a) => (
                <WeightBar
                  key={a.agentId}
                  agent={a}
                  isTop={a.agentId === top.agentId}
                  progress={scrollYProgress}
                  equalPct={toPct(equal)}
                  realPct={toPct(a.weightShare)}
                  reduced={!!reduced}
                />
              ))}
            </div>

            <div className="mt-7 flex flex-wrap gap-2 border-t border-bureau-line pt-4">
              {['inverse-Brier weighting', 'per-agent cap', 'FLAT dead-band · no leverage'].map((t) => (
                <span
                  key={t}
                  className="border border-bureau-line px-2.5 py-1 font-monod text-[11px] uppercase tracking-[0.18em] text-bureau-muted"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Caption({
  children,
  opacity,
  active,
  last = false
}: {
  children: React.ReactNode;
  opacity: MotionValue<number> | number;
  active: boolean;
  last?: boolean;
}) {
  // With reduced motion only the final caption renders, statically.
  if (!active) {
    if (!last) return null;
    return <div>{children}</div>;
  }
  return (
    <motion.div style={{ opacity }} className={last ? '' : 'absolute inset-0'}>
      {children}
    </motion.div>
  );
}

function WeightBar({
  agent,
  isTop,
  progress,
  equalPct,
  realPct,
  reduced
}: {
  agent: MechanismAgent;
  isTop: boolean;
  progress: MotionValue<number>;
  equalPct: string;
  realPct: string;
  reduced: boolean;
}) {
  // Non-rogue agents morph to their earned weight in beat 2; the rogue holds its
  // equal "claimed" voice until beat 3, then collapses to its true weight.
  const width = useTransform(
    progress,
    agent.isRogue ? [0, 0.5, 0.62, 0.8] : [0, 0.3, 0.46, 1],
    agent.isRogue ? [equalPct, equalPct, equalPct, realPct] : [equalPct, equalPct, realPct, realPct]
  );

  const color = agent.isRogue
    ? 'var(--color-fall)'
    : isTop
      ? 'var(--color-brass)'
      : 'color-mix(in oklab, var(--color-bureau-fg) 55%, transparent)';

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between font-monod text-[11px]">
        <span className={agent.isRogue ? 'text-fall' : 'text-bureau-fg'}>
          {agent.agentId}
          {agent.isRogue && (
            <span className="ml-2 border border-fall/50 px-1 text-[10px] uppercase tracking-[0.18em] text-fall">
              rogue
            </span>
          )}
        </span>
        <span className="text-bureau-muted">
          Brier {agent.brier.toFixed(3)} · {Math.round(agent.weightShare * 100)}%
        </span>
      </div>
      <div className="h-[3px] w-full bg-bureau-line/60">
        <motion.div
          className="h-full"
          style={{ width: reduced ? realPct : width, background: color }}
        />
      </div>
    </div>
  );
}
