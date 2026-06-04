'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';

/**
 * Tabular number that counts up once when it enters the viewport.
 * Falls back to the static value under prefers-reduced-motion.
 */
export function CountUp({
  value,
  duration = 1.6,
  format = (n: number) => Math.round(n).toLocaleString('en-US'),
  className = ''
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? format(value) : format(0));

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setDisplay(format(value));
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(format(v))
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, reduced]);

  return (
    <span ref={ref} className={`font-monod ${className}`}>
      {display}
    </span>
  );
}
