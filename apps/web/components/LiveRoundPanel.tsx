'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  API_BASE,
  EXPLORER_TX_BASE,
  type LiveReputation,
  type LiveRound,
  type RoundEvent,
  type RoundsState
} from '../lib/rounds';

/** The live wire: real-time rounds streamed over SSE — agents stake predictions, the price
 *  resolves them, reputation moves on the record, the consensus is scored honestly. */
export function LiveRoundPanel({ market }: { market: string }) {
  const [current, setCurrent] = useState<LiveRound | null>(null);
  const [lastResolved, setLastResolved] = useState<LiveRound | null>(null);
  const [reputation, setReputation] = useState<LiveReputation[]>([]);
  const [history, setHistory] = useState<LiveRound[]>([]);
  const [roundSeconds, setRoundSeconds] = useState(60);
  const [now, setNow] = useState(() => Date.now());
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  // initial snapshot
  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/rounds?market=${encodeURIComponent(market)}`)
      .then((r) => r.json())
      .then((d: RoundsState) => {
        if (!alive) return;
        const m = d.markets?.[0];
        if (!m) return;
        setRoundSeconds(d.roundSeconds ?? 60);
        setCurrent(m.current);
        setReputation(m.reputation ?? []);
        setHistory((m.history ?? []).filter((r) => r.resolvedAt));
        setLastResolved((m.history ?? []).find((r) => r.resolvedAt) ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [market]);

  // SSE stream
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/rounds/stream?market=${encodeURIComponent(market)}`);
    esRef.current = es;
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      try {
        const e = JSON.parse(msg.data) as RoundEvent;
        if (e.market !== market) return;
        setReputation(e.reputation ?? []);
        if (e.type === 'round_open') setCurrent(e.round);
        if (e.type === 'round_resolved') {
          setLastResolved(e.round);
          setHistory((h) => [e.round, ...h].slice(0, 24));
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => es.close();
  }, [market]);

  // 4Hz clock for the countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const remainingMs = Math.max(0, (current?.closesAt ?? 0) - now);
  const progress = current ? Math.min(1, Math.max(0, remainingMs / (roundSeconds * 1000))) : 0;
  const secs = Math.ceil(remainingMs / 1000);

  const scored = useMemo(() => history.filter((h) => h.consensusCorrect !== undefined), [history]);
  const hits = scored.filter((h) => h.consensusCorrect).length;
  const hitRate = scored.length ? Math.round((hits / scored.length) * 100) : null;

  return (
    <section className="mt-10 border border-bureau-line bg-bureau-panel">
      {/* header strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bureau-line px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-2 w-2 rounded-full ${connected ? 'animate-pulse bg-brass' : 'bg-bureau-muted'}`}
            />
          </span>
          <span className="font-monod text-[11px] uppercase tracking-[0.22em] text-brass">live wire</span>
          {current && (
            <span className="font-monod text-[11px] uppercase tracking-[0.18em] text-bureau-muted">
              round nº{current.id}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 font-monod text-[11px] uppercase tracking-[0.18em]">
          {hitRate !== null && (
            <span className="text-bureau-muted">
              consensus hit-rate <span className="text-bureau-fg">{hitRate}%</span> · {scored.length} scored
            </span>
          )}
          <span className="text-bureau-muted">
            closes in <span className="tabular-nums text-bureau-fg">{String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</span>
          </span>
        </div>
      </div>
      {/* countdown rail */}
      <div className="h-[2px] w-full bg-bureau">
        <div className="h-full bg-brass transition-[width] duration-300 ease-linear" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="grid gap-0 md:grid-cols-[1fr_280px]">
        {/* left: open round */}
        <div className="border-b border-bureau-line p-5 md:border-b-0 md:border-r">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
              open @ <span className="tabular-nums text-bureau-fg">{current ? fmtPrice(current.openPrice) : '—'}</span>
            </div>
            {current && (
              <div className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
                house call:{' '}
                <span style={{ color: dirColor(current.consensus.direction) }}>
                  {current.consensus.direction}
                </span>{' '}
                <span className="text-bureau-fg">{current.consensus.sizeBps}bps</span> ·{' '}
                <span className="tabular-nums">{(current.consensus.confidence * 100).toFixed(1)}%</span>
                {current.chainTx && (
                  <>
                    {' '}
                    ·{' '}
                    <a
                      href={`${EXPLORER_TX_BASE}/${current.chainTx}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brass hover:underline"
                    >
                      on mantle ↗
                    </a>
                  </>
                )}
              </div>
            )}
          </div>

          {/* predictions on the wire */}
          <div className="mt-4 flex flex-wrap gap-2">
            <AnimatePresence mode="popLayout">
              {(current?.predictions ?? []).map((p, i) => (
                <motion.div
                  key={`${current?.id}-${p.agentId}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-2 border border-bureau-line px-2.5 py-1.5"
                >
                  <span className="font-monod text-[11px] text-bureau-fg">{p.agentId.replace(/_v\d+$/, '')}</span>
                  <span className="font-monod text-[11px]" style={{ color: dirColor(p.direction) }}>
                    {p.direction}
                  </span>
                  <span className="font-monod text-[11px] tabular-nums text-bureau-muted">
                    {(p.probability * 100).toFixed(0)}%
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* last resolution */}
          <AnimatePresence mode="wait">
            {lastResolved && lastResolved.outcome !== undefined && (
              <motion.div
                key={lastResolved.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-5 flex flex-wrap items-center gap-3 border-t border-bureau-line pt-4 font-monod text-[11px] uppercase tracking-[0.16em]"
              >
                <span className="text-bureau-muted">round nº{lastResolved.id} resolved:</span>
                <span style={{ color: lastResolved.outcome === 1 ? 'var(--color-rise)' : 'var(--color-fall)' }}>
                  price {lastResolved.outcome === 1 ? '▲ up' : '▼ down'}
                </span>
                {lastResolved.consensusCorrect !== undefined && (
                  <span style={{ color: lastResolved.consensusCorrect ? 'var(--color-rise)' : 'var(--color-fall)' }}>
                    consensus {lastResolved.consensusCorrect ? '✓ right' : '✗ wrong'}
                  </span>
                )}
                <span className="text-bureau-muted">
                  {lastResolved.results?.filter((r) => r.correct).length}/{lastResolved.results?.length} agents right
                </span>
                {lastResolved.chainTx && (
                  <a
                    href={`${EXPLORER_TX_BASE}/${lastResolved.chainTx}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brass hover:underline"
                  >
                    recorded on mantle ↗
                  </a>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* the tape: recent verdicts */}
          {scored.length > 0 && (
            <div className="mt-4 flex items-center gap-1.5">
              <span className="mr-1 font-monod text-[10px] uppercase tracking-[0.2em] text-bureau-muted">tape</span>
              {scored.slice(0, 18).reverse().map((h) => (
                <span
                  key={h.id}
                  title={`round ${h.id}: consensus ${h.consensusCorrect ? 'right' : 'wrong'}`}
                  className="h-2.5 w-2.5"
                  style={{ background: h.consensusCorrect ? 'var(--color-rise)' : 'var(--color-fall)', opacity: 0.85 }}
                />
              ))}
            </div>
          )}
        </div>

        {/* right: live reputation, ranks animate */}
        <div className="p-5">
          <div className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
            live calibration <span className="text-bureau-fg">(session)</span>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {reputation.map((r, i) => (
              <motion.div
                layout
                key={r.agentId}
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                className="flex items-center justify-between gap-2 border border-bureau-line px-2.5 py-1.5"
                style={r.isRogue ? { borderColor: 'color-mix(in oklab, var(--color-fall) 45%, transparent)' } : undefined}
              >
                <div className="flex items-center gap-2">
                  <span className="w-4 font-monod text-[10px] tabular-nums text-bureau-muted">{i + 1}</span>
                  <span className="font-monod text-[11px] text-bureau-fg">{r.agentId.replace(/_v\d+$/, '')}</span>
                  {r.isRogue && <span className="font-monod text-[9px] uppercase text-fall">rogue</span>}
                </div>
                <span className="font-monod text-[11px] tabular-nums" style={{ color: i === 0 ? 'var(--color-brass)' : 'var(--color-bureau-muted)' }}>
                  {r.liveBrier.toFixed(3)}
                </span>
              </motion.div>
            ))}
          </div>
          <div className="mt-3 font-monod text-[10px] uppercase tracking-[0.18em] text-bureau-muted">
            brier, replay prior + {reputation[0]?.rounds ?? 0} live rounds · lower is better
          </div>
        </div>
      </div>
    </section>
  );
}

function dirColor(dir: string): string {
  if (dir === 'LONG') return 'var(--color-rise)';
  if (dir === 'SHORT') return 'var(--color-fall)';
  return 'var(--color-bureau-muted)';
}

function fmtPrice(p: number): string {
  return p >= 100 ? p.toLocaleString('en-US', { maximumFractionDigits: 2 }) : p.toPrecision(4);
}
