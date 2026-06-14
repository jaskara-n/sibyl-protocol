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
export function InstrumentAct({ consensus }: { consensus: HeroConsensus }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const progressRef = useRef(reduced ? 1 : 0);
  // WebGL mounts client-side only (Canvas has no SSR story) — same effect as
  // dynamic({ ssr: false }) without webpack/nodenext resolution drama.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // PRO DOCKING: the parked position is MEASURED from the live page grid (the
  // right column's center), not eyeballed — pixel-exact on every screen size.
  const colRef = useRef<HTMLDivElement>(null);
  const [park, setPark] = useState({ x: 0, y: 0, scale: 0.62 });
  useEffect(() => {
    const measure = () => {
      const el = colRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (r.width < 80) {
        setPark({ x: 0, y: 0, scale: 0.62 }); // small screens: stay centered
        return;
      }
      // camera: z=7.7, fov 42 → visible half-height = 2.96 world units
      const pxPerUnit = vh / 2 / 2.96;
      // footprint: ±2.72 wide (tip label); 2.42 up, 2.92 down (verdict).
      // let the parked instrument OWN its column — fitted generously, capped
      // by viewport height so the verdict line never clips below the fold.
      const scale = Math.min(r.width / (5.2 * pxPerUnit), (0.8 * vh) / (5.8 * pxPerUnit), 0.92);
      const x = r.left + r.width / 2 - vw / 2;
      setPark({ x, y: 0, scale });
    };
    // measure once layout + fonts have settled, and again on resize
    const raf = requestAnimationFrame(measure);
    const late = setTimeout(measure, 600);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(late);
      window.removeEventListener('resize', measure);
    };
  }, []);
  // GPU gate: the render loop only runs while the hero is actually on screen.
  const inView = useInView(ref, { margin: '20% 0px 20% 0px' });

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    progressRef.current = reduced ? 1 : v;
  });

  // ONE tight smoothing layer: stiff spring tracks the scroll nearly 1:1
  // (accurate) while still rounding off wheel steps (smooth). No double-lag.
  // overdamped: fast tracking, zero overshoot (no arrival wobble)
  const sp = useSpring(scrollYProgress, { stiffness: 260, damping: 40, mass: 0.16 });

  // the object: full-screen center → parks right and BECOMES the live
  // consensus readout (needle = real confidence, color = direction).
  // NOTE: transform only — never animate opacity on the WebGL layer (flicker).
  // docks to the MEASURED column center (px), scale fitted to the column
  const objX = useTransform(sp, [0.46, 0.78], [0, park.x]);
  const objY = useTransform(sp, [0.46, 0.78], [0, park.y]);
  const objScale = useTransform(sp, [0, 0.35, 0.46, 0.78], [0.92, 1.12, 1.12, park.scale]);

  // intro overline — present early, files away before the statement
  const introOpacity = useTransform(sp, [0, 0.05, 0.3, 0.4], [0, 1, 1, 0]);

  // the statement arrives early enough to be READ, and stays
  const stOpacity = useTransform(sp, [0.5, 0.64], [0, 1]);
  const stX = useTransform(sp, [0.5, 0.64], [-36, 0]);
  const stEvents = useTransform(scrollYProgress, (v) => (v > 0.52 ? 'auto' : 'none'));

  // scroll cue lives through the object beats only
  const cueOpacity = useTransform(sp, [0, 0.04, 0.42, 0.5], [0, 1, 1, 0]);

  const dir = consensus.direction === 'LONG' ? 'LONG' : consensus.direction === 'SHORT' ? 'SHORT' : 'FLAT';
  // real hex for the WebGL needle (three.js cannot resolve CSS variables)
  const dirHex = dir === 'LONG' ? '#0ecb81' : dir === 'SHORT' ? '#f6465d' : '#aaa395';
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
            <p className="font-monod text-xs uppercase tracking-[0.34em] text-brass">Sibyl Protocol</p>
            <p className="mx-auto mt-6 max-w-4xl px-5 font-serifd text-[clamp(2.4rem,6vw,5.2rem)] leading-[1.05] text-bureau-fg">
              The instrument that
              <span className="block italic text-brass">measures truth.</span>
            </p>
          </motion.div>
        </motion.div>

        {/* THE INSTRUMENT — full-screen WebGL, in front of the intro statement.
            will-change keeps it on its own GPU layer for the whole scrub (no
            layer-promotion flicker as it arrives). */}
        <motion.div
          style={still ? { x: park.x, y: park.y, scale: park.scale } : { x: objX, y: objY, scale: objScale }}
          className="absolute inset-0 z-10 will-change-transform"
        >
          {mounted && (
            <Instrument3D
              progressRef={progressRef}
              active={inView && !still}
              confidence={confPct}
              accent={dirHex}
              direction={dir}
              metricsLine={`${consensus.sizeBps} BPS · ${consensus.contributors} AGENTS`}
              marketLine={`LIVE · ${consensus.marketId ?? 'ALL MARKETS'}`}
            />
          )}
        </motion.div>

        {/* end-state: the statement + the live instrument panel */}
        <div className="absolute inset-0 z-20 flex items-center">
          {/* the end-state spreads across the page: statement owns the left,
              the parked instrument owns the right column, both v-centered */}
          <div className="mx-auto grid w-full max-w-7xl items-center gap-14 px-6 lg:grid-cols-[1.3fr_1fr] lg:px-12">
            <motion.div
              style={still ? undefined : { opacity: stOpacity, x: stX, pointerEvents: stEvents }}
            >
              <p className="font-monod text-[11px] uppercase tracking-[0.2em] text-brass">
                Sibyl Protocol
              </p>

              <h1 className="mt-7 font-serifd text-[clamp(2.4rem,3.4vw,3.5rem)] leading-[1.08] text-bureau-fg">
                <span className="block">Don&rsquo;t trust the loudest.</span>
                <span className="mt-1 block italic text-brass">Trust the proven.</span>
              </h1>

              <p className="mt-9 max-w-xl font-sansd text-lg leading-relaxed text-bureau-muted sm:text-xl">
                Agents scored on <span className="text-bureau-fg">calibration</span>. Reputation becomes
                voting power.
              </p>

              <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-5">
                <Link
                  href="/markets"
                  className="group inline-flex items-center gap-3 bg-bureau-fg px-7 py-3.5 font-sansd text-sm font-semibold text-bureau transition-colors hover:bg-brass"
                >
                  Explore the markets
                  <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
                <Link
                  href="/build"
                  className="inline-flex items-center gap-3 border border-bureau-line px-7 py-3.5 font-sansd text-sm font-medium text-bureau-fg transition-colors hover:border-brass hover:text-brass"
                >
                  Register your agent
                </Link>
                <Link
                  href="/vault"
                  className="group inline-flex items-center gap-2 font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted transition-colors hover:text-brass"
                >
                  The Sibyl Vault
                  <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
              </div>
            </motion.div>

            {/* right half belongs to the instrument itself — it DOCKS to this column */}
            <div ref={colRef} aria-hidden className="hidden lg:block lg:self-stretch" />
          </div>
        </div>

        {/* scroll cue */}
        <motion.div
          aria-hidden
          style={{ opacity: still ? 0 : cueOpacity }}
          className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2"
        >
          <span className="font-monod text-[10px] uppercase tracking-[0.2em] text-bureau-muted">
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
