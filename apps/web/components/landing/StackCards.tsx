'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';

type ProductCard = {
  numeral: string;
  kicker: string;
  title: React.ReactNode;
  body: string;
  meta: string[];
  href: string;
  cta: string;
};

const CARDS: ProductCard[] = [
  {
    numeral: '03',
    kicker: 'The map',
    title: (
      <>
        Markets, ranked by <span className="italic text-brass">conviction.</span>
      </>
    ),
    body: 'Follow the smart money in real time: markets sort by where the most reputable, most active agents are working right now — reputation weight × participation, read straight from the chain.',
    meta: ['conviction index', 'per-market reputation', 'on-chain reads'],
    href: '/markets',
    cta: 'Open the map'
  },
  {
    numeral: '04',
    kicker: 'The forecast',
    title: (
      <>
        Prediction markets, <span className="italic text-brass">permissionless.</span>
      </>
    ),
    body: 'Pose a verifiable yes/no question and launch a tradeable market in one transaction — outcome tokens, an automated market maker where the YES price is the probability, and resolution you can audit.',
    meta: ['one-tx launch', 'YES price = probability', 'mint · trade · resolve · redeem'],
    href: '/forecast',
    cta: 'Read the forecasts'
  },
  {
    numeral: '05',
    kicker: 'The vault',
    title: (
      <>
        Capital, steered by <span className="italic text-brass">reputation.</span>
      </>
    ),
    body: 'An ERC-4626 vault that allocates by the reputation-weighted consensus — real spot trades and real YES/NO positions through a single routing venue. No leverage. Verified round-trip on Mantle.',
    meta: ['ERC-4626', 'spot + predictions', 'performance fee · high-water mark'],
    href: '/vault',
    cta: 'Inspect the vault'
  }
];

/**
 * Act III — the bureau's three products as stacking dossiers: each card is
 * sticky; the next slides over it while the one beneath recedes and dims,
 * like files being stacked on a desk.
 */
export function StackCards() {
  return (
    <section aria-label="What the bureau offers">
      <div className="mx-auto max-w-6xl px-5">
        {CARDS.map((card, i) => (
          <StackCard key={card.href} card={card} index={i} total={CARDS.length} />
        ))}
      </div>
    </section>
  );
}

function StackCard({ card, index, total }: { card: ProductCard; index: number; total: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  // As the NEXT card arrives (this card's wrapper scrolls past its sticky hold),
  // this card recedes: scales down a touch and dims. transform/opacity only.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const isLast = index === total - 1;
  const scale = useTransform(scrollYProgress, [0, 1], [1, isLast || reduced ? 1 : 0.94]);
  const dim = useTransform(scrollYProgress, [0, 1], [0, isLast || reduced ? 0 : 0.55]);

  return (
    <div ref={ref} className={isLast ? 'pb-[12vh]' : 'pb-[36vh]'}>
      <motion.div
        style={{ scale, top: `calc(9vh + ${index * 22}px)` }}
        className="bureau-frame sticky origin-top overflow-hidden"
      >
        <div className="bureau-grain" aria-hidden />
        {/* receding dim layer */}
        <motion.div aria-hidden style={{ opacity: dim }} className="absolute inset-0 z-10 bg-bureau" />

        <div className="relative grid gap-10 p-8 sm:p-12 lg:grid-cols-[auto_1fr_auto] lg:items-end">
          <div
            aria-hidden
            className="select-none font-serifd text-[clamp(4rem,9vw,8rem)] leading-none text-bureau-line"
          >
            {card.numeral}
          </div>

          <div>
            <p className="font-monod text-[11px] uppercase tracking-[0.42em] text-brass">{card.kicker}</p>
            <h3 className="mt-4 font-serifd text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.02] text-bureau-fg">
              {card.title}
            </h3>
            <p className="mt-5 max-w-2xl font-sansd leading-relaxed text-bureau-muted">{card.body}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {card.meta.map((m) => (
                <span
                  key={m}
                  className="border border-bureau-line px-2.5 py-1 font-monod text-[10px] uppercase tracking-[0.18em] text-bureau-muted"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>

          <Link
            href={card.href}
            className="group inline-flex items-center gap-3 self-end border border-bureau-line px-6 py-3 font-sansd text-sm font-medium text-bureau-fg transition-colors hover:border-brass hover:text-brass"
          >
            {card.cta}
            <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </div>

        <div className="tick-scale" aria-hidden />
      </motion.div>
    </div>
  );
}
