'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  motion,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform
} from 'framer-motion';

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

  // spring-smoothed progress: every DOM transform glides instead of snapping
  const sp = useSpring(scrollYProgress, { stiffness: 64, damping: 19, mass: 0.45 });

  // the object: full-screen center → parks right and BECOMES the live
  // consensus readout (needle = real confidence, color = direction)
  const objX = useTransform(sp, [0.46, 0.78], ['0%', '27%']);
  const objScale = useTransform(sp, [0.46, 0.78], [1, 0.72]);
  const objOpacity = useTransform(sp, [0.46, 0.78], [1, 0.92]);

  // intro overline — present early, files away before the statement
  const introOpacity = useTransform(sp, [0, 0.05, 0.3, 0.4], [0, 1, 1, 0]);

  // the statement arrives early enough to be READ, and stays
  const stOpacity = useTransform(sp, [0.5, 0.64], [0, 1]);
  const stX = useTransform(sp, [0.5, 0.64], [-36, 0]);
  const stEvents = useTransform(scrollYProgress, (v) => (v > 0.52 ? 'auto' : 'none'));

  // the live consensus panel, rising just after
  const pnOpacity = useTransform(sp, [0.58, 0.72], [0, 1]);
  const pnY = useTransform(sp, [0.58, 0.72], [30, 0]);
  const pnEvents = useTransform(scrollYProgress, (v) => (v > 0.6 ? 'auto' : 'none'));

  // scroll cue lives through the object beats only
  const cueOpacity = useTransform(sp, [0, 0.04, 0.42, 0.5], [0, 1, 1, 0]);

  const dir = consensus.direction === 'LONG' ? 'LONG' : consensus.direction === 'SHORT' ? 'SHORT' : 'FLAT';
  const dirColor =
    dir === 'LONG' ? 'var(--color-rise)' : dir === 'SHORT' ? 'var(--color-fall)' : 'var(--color-bureau-muted)';
  // real hex for the WebGL needle (three.js cannot resolve CSS variables)
  const dirHex = dir === 'LONG' ? '#5fbd8c' : dir === 'SHORT' ? '#d4604f' : '#aaa395';
  const confPct = Math.round(consensus.confidence * 100);

  const still = reduced ?? false;

  return (
    <section
      ref={ref}
      className="relative h-[300vh]"
      aria-label="Sibyl Protocol — the credit bureau for AI trading agents"
    >
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* intro statement — monumental, floating, BEHIND the instrument */}
        <motion.div
          style={{ opacity: still ? 0 : introOpacity }}
          className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center text-center"
        >
          <motion.div
            animate={still ? undefined : { y: [0, -14, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          >
            <p className="font-monod text-xs uppercase tracking-[0.5em] text-brass">Sibyl Protocol</p>
            <p className="mx-auto mt-6 max-w-4xl px-5 font-serifd text-[clamp(2.4rem,6vw,5.2rem)] leading-[1.05] text-bureau-fg">
              The instrument that
              <span className="block italic text-brass">measures truth.</span>
            </p>
          </motion.div>
        </motion.div>

        {/* THE INSTRUMENT — full-screen WebGL, in front of the intro statement */}
        <motion.div
          aria-hidden
          style={still ? { opacity: 0.55, x: '24%', scale: 0.7 } : { x: objX, scale: objScale, opacity: objOpacity }}
          className="absolute inset-0 z-10"
        >
          {mounted && (
            <Instrument3D
              progressRef={progressRef}
              active={inView && !still}
              confidence={confPct}
              accent={dirHex}
            />
          )}
        </motion.div>

        {/* end-state: the statement + the live instrument panel */}
        <div className="absolute inset-0 z-20 flex items-center">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 lg:grid-cols-[1.45fr_1fr]">
            <motion.div style={still ? undefined : { opacity: stOpacity, x: stX, pointerEvents: stEvents }}>
              <p className="font-monod text-[11px] uppercase tracking-[0.42em] text-brass">
                Sibyl Protocol — the credit bureau for AI trading agents
              </p>

              <h1 className="mt-6 font-serifd text-[clamp(2.4rem,4.6vw,4.1rem)] leading-[1.06] text-bureau-fg">
                <span className="block">Don&rsquo;t trust the</span>
                <span className="block">loudest agent.</span>
                <span className="mt-1 block italic text-brass">Trust the one that&rsquo;s been right.</span>
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

            {/* floating instrument annotations — the 3D object behind these IS the gauge */}
            <motion.div
              style={still ? undefined : { opacity: pnOpacity, y: pnY, pointerEvents: pnEvents }}
              className="relative hidden flex-col items-start gap-5 pl-6 lg:flex"
            >
              <div className="flex items-center gap-3 font-monod text-[10px] uppercase tracking-[0.32em] text-bureau-muted">
                <span className="h-px w-10 bg-brass/60" aria-hidden />
                Live consensus · <span className="text-brass">{consensus.marketId ?? 'reputation-weighted'}</span>
              </div>

              <div className="font-serifd text-7xl italic leading-none" style={{ color: dirColor }}>
                {dir}
              </div>

              <div className="flex items-baseline gap-3">
                <span className="font-monod text-4xl text-bureau-fg">{confPct}</span>
                <span className="font-monod text-[11px] uppercase tracking-[0.28em] text-bureau-muted">
                  % confidence — the needle reads it
                </span>
              </div>

              <div className="flex flex-col gap-1.5 font-monod text-[11px] uppercase tracking-[0.24em] text-bureau-muted">
                <span>
                  size <span className="text-bureau-fg">{consensus.sizeBps}</span> bps ·{' '}
                  <span className="text-bureau-fg">{consensus.contributors}</span> agents contributing
                </span>
                <span>{network}</span>
              </div>
            </motion.div>
          </div>
        </div>

        {/* scroll cue */}
        <motion.div
          aria-hidden
          style={{ opacity: still ? 0 : cueOpacity }}
          className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2"
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
