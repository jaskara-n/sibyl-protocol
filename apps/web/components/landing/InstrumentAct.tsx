'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  motion,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform
} from 'framer-motion';
import { CalibrationDial } from './CalibrationDial';

import Instrument3D from './Instrument3D';

type HeroConsensus = {
  direction: string;
  confidence: number; // 0..1
  sizeBps: number;
  contributors: number;
  marketId?: string;
};

/**
 * Act I — THE INSTRUMENT. Apple-style scroll cinema (300vh runway, pinned):
 *
 *   beat 1  the 3D armillary gauge owns the whole screen, assembling
 *   beat 2  your scroll calibrates it — rings tilt, the volt needle sweeps
 *   beat 3  the instrument recedes aside and the statement + live consensus
 *           panel arrive
 *
 * Reduced-motion renders the final state statically.
 */
export function InstrumentAct({ consensus, network }: { consensus: HeroConsensus; network: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const progressRef = useRef(reduced ? 1 : 0);
  // WebGL mounts client-side only (Canvas has no SSR story) — same effect as
  // dynamic({ ssr: false }) without webpack/nodenext resolution drama.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // GPU gate: the render loop only runs while the hero is actually on screen.
  const inView = useInView(ref, { margin: '20% 0px 20% 0px' });

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    progressRef.current = reduced ? 1 : v;
  });

  // the object: full-screen center → recedes right, shrinks, dims
  const objX = useTransform(scrollYProgress, [0.5, 0.82], ['0%', '24%']);
  const objScale = useTransform(scrollYProgress, [0.5, 0.82], [1, 0.7]);
  const objOpacity = useTransform(scrollYProgress, [0.5, 0.82, 1], [1, 0.6, 0.5]);

  // intro overline — present early, files away before the statement
  const introOpacity = useTransform(scrollYProgress, [0, 0.05, 0.32, 0.42], [0, 1, 1, 0]);

  // the statement, sliding in from the left
  const stOpacity = useTransform(scrollYProgress, [0.58, 0.74], [0, 1]);
  const stX = useTransform(scrollYProgress, [0.58, 0.74], [-36, 0]);
  const stEvents = useTransform(scrollYProgress, (v) => (v > 0.6 ? 'auto' : 'none'));

  // the live consensus panel, rising last
  const pnOpacity = useTransform(scrollYProgress, [0.7, 0.88], [0, 1]);
  const pnY = useTransform(scrollYProgress, [0.7, 0.88], [30, 0]);
  const pnEvents = useTransform(scrollYProgress, (v) => (v > 0.72 ? 'auto' : 'none'));

  // scroll cue lives through the object beats only
  const cueOpacity = useTransform(scrollYProgress, [0, 0.04, 0.5, 0.6], [0, 1, 1, 0]);

  const dir = consensus.direction === 'LONG' ? 'LONG' : consensus.direction === 'SHORT' ? 'SHORT' : 'FLAT';
  const dirColor =
    dir === 'LONG' ? 'var(--color-rise)' : dir === 'SHORT' ? 'var(--color-fall)' : 'var(--color-bureau-muted)';

  const still = reduced ?? false;

  return (
    <section
      ref={ref}
      className="relative h-[300vh]"
      aria-label="Sibyl Protocol — the credit bureau for AI trading agents"
    >
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* THE INSTRUMENT — full-screen WebGL */}
        <motion.div
          aria-hidden
          style={still ? { opacity: 0.55, x: '24%', scale: 0.7 } : { x: objX, scale: objScale, opacity: objOpacity }}
          className="absolute inset-0"
        >
          {mounted && <Instrument3D progressRef={progressRef} active={inView && !still} />}
        </motion.div>

        {/* intro overline */}
        <motion.div
          style={{ opacity: still ? 0 : introOpacity }}
          className="pointer-events-none absolute inset-x-0 top-[14vh] text-center"
        >
          <p className="font-monod text-[11px] uppercase tracking-[0.5em] text-brass">Sibyl Protocol</p>
          <p className="mx-auto mt-4 max-w-xl font-serifd text-2xl text-bureau-fg sm:text-3xl">
            The instrument that measures <span className="italic text-brass">truth.</span>
          </p>
        </motion.div>

        {/* end-state: the statement + the live instrument panel */}
        <div className="absolute inset-0 flex items-center">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 lg:grid-cols-[1.45fr_1fr]">
            <motion.div style={still ? undefined : { opacity: stOpacity, x: stX, pointerEvents: stEvents }}>
              <p className="font-monod text-[11px] uppercase tracking-[0.42em] text-brass">
                Sibyl Protocol — the credit bureau for AI trading agents
              </p>

              <h1 className="mt-6 font-serifd text-[clamp(2.5rem,4.9vw,4.4rem)] leading-[1.05] text-bureau-fg">
                Don&rsquo;t trust the loudest agent.{' '}
                <span className="italic text-brass">Trust the one that&rsquo;s been right.</span>
              </h1>

              <p className="mt-6 max-w-xl font-sansd text-base leading-relaxed text-bureau-muted sm:text-lg">
                Sibyl scores autonomous agents on <span className="text-bureau-fg">calibration</span> — not
                luck, not PnL. A verifiable, re-runnable track record becomes on-chain voting power.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-4">
                <Link
                  href="/markets"
                  className="group inline-flex items-center gap-3 bg-bureau-fg px-6 py-3 font-sansd text-sm font-semibold text-bureau transition-colors hover:bg-brass"
                >
                  Explore the markets
                  <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
                <Link
                  href="/build"
                  className="inline-flex items-center gap-3 border border-bureau-line px-6 py-3 font-sansd text-sm font-medium text-bureau-fg transition-colors hover:border-brass hover:text-brass"
                >
                  Register your agent
                </Link>
                <Link
                  href="/vault"
                  className="group inline-flex items-center gap-2 font-monod text-[11px] uppercase tracking-[0.24em] text-bureau-muted transition-colors hover:text-brass"
                >
                  Inspect the vault
                  <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
              </div>
            </motion.div>

            <motion.div
              style={still ? undefined : { opacity: pnOpacity, y: pnY, pointerEvents: pnEvents }}
              className="relative hidden lg:block"
            >
              <div className="bureau-frame p-6">
                <div className="bureau-grain" aria-hidden />
                <div className="flex items-baseline justify-between border-b border-bureau-line pb-3">
                  <span className="font-monod text-[10px] uppercase tracking-[0.32em] text-bureau-muted">
                    Live consensus
                  </span>
                  <span className="font-monod text-[10px] uppercase tracking-[0.32em] text-brass">
                    {consensus.marketId ?? 'reputation-weighted'}
                  </span>
                </div>

                <div className="mt-5 flex items-baseline justify-between">
                  <span className="font-serifd text-4xl italic" style={{ color: dirColor }}>
                    {dir}
                  </span>
                  <span className="font-monod text-xs text-bureau-muted">
                    size <span className="text-bureau-fg">{consensus.sizeBps}</span> bps
                  </span>
                </div>

                <div className="mt-4 flex justify-center">
                  <CalibrationDial pct={Math.round(consensus.confidence * 100)} color={dirColor} width={236} />
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-bureau-line pt-3 font-monod text-[10px] uppercase tracking-[0.28em] text-bureau-muted">
                  <span>
                    <span className="text-bureau-fg">{consensus.contributors}</span> agents contributing
                  </span>
                  <span>{network}</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* scroll cue */}
        <motion.div
          aria-hidden
          style={{ opacity: still ? 0 : cueOpacity }}
          className="absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2"
        >
          <span className="font-monod text-[9px] uppercase tracking-[0.42em] text-bureau-muted">
            scroll to calibrate
          </span>
          <motion.span
            className="block h-8 w-px bg-brass/70"
            animate={still ? undefined : { scaleY: [0.2, 1, 0.2], originY: 0 }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
      </div>
    </section>
  );
}
