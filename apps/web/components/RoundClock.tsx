'use client';

import { useEffect, useState } from 'react';

/** Live countdown to the next round boundary (top of the hour). Pure client-side liveness
 *  until the real round-loop backend drives it over websocket. */
export function RoundClock() {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (now === null) {
    return (
      <div className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
        round · syncing…
      </div>
    );
  }

  const msToNextHour = 3_600_000 - (now % 3_600_000);
  const secs = Math.floor(msToNextHour / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  const round = Math.floor(now / 3_600_000);

  return (
    <div className="flex items-center gap-3 font-monod text-[11px] uppercase tracking-[0.2em]">
      <span className="relative flex h-2 w-2">
        <span className="live-dot absolute inline-flex h-2 w-2 rounded-full bg-rise" />
      </span>
      <span className="text-bureau-muted">Round #{round}</span>
      <span className="text-bureau-fg">
        next consensus in <span className="text-rise">{mm}:{ss}</span>
      </span>
    </div>
  );
}
