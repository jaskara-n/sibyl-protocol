'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { CalibrationDial } from './CalibrationDial';
import { LineReveal } from './Reveal';

const EASE = [0.22, 1, 0.36, 1] as const;

type HeroConsensus = {
  direction: string;
  confidence: number; // 0..1
  sizeBps: number;
  contributors: number;
  marketId?: string;
};

/**
 * Act I — the pinned hero. The statement holds the screen (sized to FIT one
 * viewport); as the reader scrolls, the type recedes upward like a page being
 * filed while the live consensus instrument keeps measuring. 170vh runway.
 */
export function HeroAct({ consensus, network }: { consensus: HeroConsensus; network: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });

  const headlineY = useTransform(scrollYProgress, [0, 0.85], ['0%', reduced ? '0%' : '-14%']);
  const headlineOpacity = useTransform(scrollYProgress, [0, 0.55, 0.9], [1, 1, reduced ? 1 : 0]);
  const panelY = useTransform(scrollYProgress, [0, 0.9], ['0%', reduced ? '0%' : '-26%']);

  const dir = consensus.direction === 'LONG' ? 'LONG' : consensus.direction === 'SHORT' ? 'SHORT' : 'FLAT';
  const dirColor =
    dir === 'LONG' ? 'var(--color-rise)' : dir === 'SHORT' ? 'var(--color-fall)' : 'var(--color-bureau-muted)';

  return (
    <section ref={ref} className="relative h-[170vh]" aria-label="Sibyl — the credit bureau for AI trading agents">
      <div className="sticky top-0 flex min-h-screen flex-col justify-center overflow-hidden">
        {/* engraved column rules framing the page */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-full max-w-6xl -translate-x-1/2 border-x border-bureau-line/60 lg:block" />

        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-14 pt-24 lg:grid-cols-[1.45fr_1fr]">
          <motion.div style={{ y: headlineY, opacity: headlineOpacity }}>
            <LineReveal delay={0.05}>
              <p className="font-monod text-[11px] uppercase tracking-[0.2em] text-brass">
                The credit bureau for AI trading agents
              </p>
            </LineReveal>

            <h1 className="mt-6 font-serifd text-[clamp(2.5rem,4.9vw,4.4rem)] leading-[1.05] text-bureau-fg">
              <LineReveal delay={0.18}>Don&rsquo;t trust the</LineReveal>
              <LineReveal delay={0.3}>loudest agent.</LineReveal>
              <LineReveal delay={0.46}>
                <span className="italic text-brass">Trust the one that&rsquo;s been right.</span>
              </LineReveal>
            </h1>

            <motion.p
              initial={reduced ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85, duration: 0.9, ease: EASE }}
              className="mt-6 max-w-xl font-sansd text-base leading-relaxed text-bureau-muted sm:text-lg"
            >
              Sibyl scores autonomous agents on <span className="text-bureau-fg">calibration</span> — not
              luck, not PnL. A verifiable, re-runnable track record becomes on-chain voting power.
            </motion.p>

            <motion.div
              initial={reduced ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0, duration: 0.9, ease: EASE }}
              className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-4"
            >
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
                className="group inline-flex items-center gap-2 font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted transition-colors hover:text-brass"
              >
                Inspect the vault
                <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </motion.div>
          </motion.div>

          {/* the live instrument */}
          <motion.div style={{ y: panelY }} className="relative">
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 36 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 1.1, ease: EASE }}
              className="bureau-frame p-6"
            >
              <div className="bureau-grain" aria-hidden />
              <div className="flex items-baseline justify-between border-b border-bureau-line pb-3">
                <span className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
                  Live consensus
                </span>
                <span className="font-monod text-[11px] uppercase tracking-[0.2em] text-brass">
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

              <div className="mt-5 flex items-center justify-between border-t border-bureau-line pt-3 font-monod text-[11px] uppercase tracking-[0.18em] text-bureau-muted">
                <span>
                  <span className="text-bureau-fg">{consensus.contributors}</span> agents contributing
                </span>
                <span>{network}</span>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* scroll cue */}
        <motion.div
          aria-hidden
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6, duration: 1 }}
          style={{ opacity: headlineOpacity }}
          className="absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2"
        >
          <span className="font-monod text-[10px] uppercase tracking-[0.2em] text-bureau-muted">scroll</span>
          <motion.span
            className="block h-8 w-px bg-brass/70"
            animate={reduced ? undefined : { scaleY: [0.2, 1, 0.2], originY: 0 }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
      </div>
    </section>
  );
}
