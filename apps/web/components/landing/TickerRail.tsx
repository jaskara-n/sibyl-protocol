'use client';

import { useEffect, useState } from 'react';

/**
 * The wire-service rail under the nav: live round countdown · network · epoch.
 * Hairline-ruled, all mono, all uppercase — the bureau's heartbeat.
 */
export function TickerRail({ network, epoch }: { network: string; epoch?: number }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const round = now === null ? null : Math.floor(now / 3_600_000);
  let clock = '—:—';
  if (now !== null) {
    const secs = Math.floor((3_600_000 - (now % 3_600_000)) / 1000);
    clock = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  }

  return (
    <div className="border-y border-bureau-line bg-bureau/95">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-2 font-monod text-[11px] uppercase tracking-[0.28em] text-bureau-muted">
        <span className="flex items-center gap-2.5">
          <span className="relative flex h-1.5 w-1.5" aria-hidden>
            <span className="live-dot absolute inline-flex h-1.5 w-1.5 rounded-full bg-rise" />
          </span>
          <span>
            Round <span className="text-bureau-fg">Nº {round ?? '—'}</span> · next consensus{' '}
            <span className="text-brass">{clock}</span>
          </span>
        </span>
        <span className="hidden sm:inline">Live on {network}</span>
        <span>
          Epoch <span className="text-bureau-fg">{epoch ?? '—'}</span> · ledger committed
        </span>
      </div>
    </div>
  );
}
