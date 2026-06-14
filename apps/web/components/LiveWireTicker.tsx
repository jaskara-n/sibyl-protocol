'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { API_BASE, type LiveRound, type RoundEvent, type RoundsState } from '../lib/rounds';

type Wire = {
  market: string;
  current: LiveRound | null;
  scored: { id: number; correct: boolean | undefined }[];
};

/** A slim, always-on strip of the live wire — one line per market: open round,
 *  the house call, countdown and running consensus hit-rate. Links into the
 *  full dossier. Quiet by design; the dot is the only thing that pulses. */
export function LiveWireTicker() {
  const [wires, setWires] = useState<Map<string, Wire>>(new Map());
  const [roundSeconds, setRoundSeconds] = useState(60);
  const [now, setNow] = useState(() => Date.now());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/rounds`)
      .then((r) => r.json())
      .then((d: RoundsState) => {
        if (!alive) return;
        setRoundSeconds(d.roundSeconds ?? 60);
        setWires(
          new Map(
            (d.markets ?? []).map((m) => [
              m.market,
              {
                market: m.market,
                current: m.current,
                scored: (m.history ?? [])
                  .filter((r) => r.resolvedAt && r.consensusCorrect !== undefined)
                  .map((r) => ({ id: r.id, correct: r.consensusCorrect }))
              }
            ])
          )
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/rounds/stream`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      try {
        const e = JSON.parse(msg.data) as RoundEvent;
        setWires((prev) => {
          const next = new Map(prev);
          const w = next.get(e.market) ?? { market: e.market, current: null, scored: [] };
          if (e.type === 'round_open') next.set(e.market, { ...w, current: e.round });
          if (e.type === 'round_resolved' && e.round.consensusCorrect !== undefined) {
            next.set(e.market, {
              ...w,
              scored: [{ id: e.round.id, correct: e.round.consensusCorrect }, ...w.scored].slice(0, 60)
            });
          }
          return next;
        });
      } catch {
        /* ignore malformed frames */
      }
    };
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      es.close();
      clearInterval(t);
    };
  }, []);

  const rows = useMemo(() => [...wires.values()].sort((a, b) => a.market.localeCompare(b.market)), [wires]);
  if (rows.length === 0) return null;

  return (
    <div className="border-y border-bureau-line bg-bureau-panel">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-5 py-2.5">
        <span className="flex items-center gap-2 font-monod text-[10px] uppercase tracking-[0.22em] text-brass">
          <span className={`inline-flex h-1.5 w-1.5 rounded-full ${connected ? 'animate-pulse bg-brass' : 'bg-bureau-muted'}`} />
          live wire
        </span>
        {rows.map((w) => {
          const c = w.current;
          const secs = c ? Math.max(0, Math.ceil((c.closesAt - now) / 1000)) : null;
          const hits = w.scored.filter((s) => s.correct).length;
          const rate = w.scored.length ? Math.round((hits / w.scored.length) * 100) : null;
          return (
            <Link
              key={w.market}
              href={`/markets/${encodeURIComponent(w.market)}`}
              className="group flex items-center gap-2.5 font-monod text-[10px] uppercase tracking-[0.16em] text-bureau-muted transition-colors hover:text-bureau-fg"
            >
              <span className="text-bureau-fg group-hover:text-brass">{w.market}</span>
              {c && (
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={c.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2.5"
                  >
                    <span>nº{c.id}</span>
                    <span style={{ color: tickerDirColor(c.consensus.direction) }}>
                      {c.consensus.direction} {c.consensus.sizeBps}bps
                    </span>
                  </motion.span>
                </AnimatePresence>
              )}
              {secs !== null && (
                <span className="tabular-nums">
                  {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}
                </span>
              )}
              {rate !== null && (
                <span>
                  hit <span className="text-bureau-fg">{rate}%</span>
                </span>
              )}
            </Link>
          );
        })}
        <span className="ml-auto hidden font-monod text-[10px] uppercase tracking-[0.18em] text-bureau-muted/70 sm:block">
          {roundSeconds}s rounds · scored vs realized price
        </span>
      </div>
    </div>
  );
}

function tickerDirColor(dir: string): string {
  if (dir === 'LONG') return 'var(--color-rise)';
  if (dir === 'SHORT') return 'var(--color-fall)';
  return 'var(--color-bureau-muted)';
}
