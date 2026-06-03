'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, type AgentProfile, type AgentRow, type Market } from '../lib/api';
import { tier } from '../lib/utils';
import { AgentAvatar } from './AgentAvatar';
import { ReputationCurve } from './ReputationCurve';
import { ReliabilityDiagram } from './ReliabilityDiagram';

const ALL = '__all__';

/** Tier letter → engraved stamp colors within the bureau palette. */
function stampColor(label: string, isRogue: boolean): string {
  if (isRogue) return 'var(--color-fall)';
  if (label === 'S' || label === 'A') return 'var(--color-brass)';
  if (label === 'B') return 'var(--color-bureau-fg)';
  if (label === 'C') return 'var(--color-bureau-muted)';
  return 'var(--color-fall)';
}

function fmtTs(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(5, 16).replace('T', ' ');
}

export function AgentProfileView({
  id,
  initialProfile,
  agg,
  markets,
  row
}: {
  id: string;
  initialProfile: AgentProfile;
  agg: AgentProfile;
  markets: Market[];
  row?: AgentRow;
}) {
  const [selected, setSelected] = useState<string>(ALL);
  const [profile, setProfile] = useState<AgentProfile>(initialProfile);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selected === ALL) {
      setProfile(agg);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<AgentProfile>(
      `/agents/${encodeURIComponent(id)}/profile?marketId=${encodeURIComponent(selected)}`,
      agg
    )
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, selected, agg]);

  const t = tier(profile.brier);
  const weightShare = row?.weightShare ?? 0;
  const erc = profile.erc8004AgentId ?? row?.erc8004AgentId ?? null;
  const isRogue = profile.isRogue || !!row?.isRogue;
  const color = stampColor(t.label, isRogue);

  const tabs = useMemo(
    () => [{ marketId: ALL, label: 'all markets' }, ...markets.map((m) => ({ marketId: m.marketId, label: m.name ?? m.marketId }))],
    [markets]
  );

  return (
    <div className="relative z-0 bg-bureau text-bureau-fg">
      <div className="mx-auto max-w-6xl px-5 pb-24">
        <div className="pt-8">
          <Link
            href="/agents"
            aria-label="Back to agents"
            className="font-monod text-[11px] uppercase tracking-[0.3em] text-bureau-muted transition-colors hover:text-brass"
          >
            ← The registry
          </Link>
        </div>

        {/* Dossier header */}
        <header className="bureau-frame mt-4 p-6 sm:p-8">
          <div className="bureau-grain" aria-hidden />
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-5">
              <AgentAvatar id={profile.agentId} size={76} ring={color} />
              <div className="min-w-0">
                <p className="font-monod text-[11px] uppercase tracking-[0.42em] text-brass">Agent dossier</p>
                <div className="mt-1.5 flex items-center gap-3">
                  <h1 className="truncate font-serifd text-3xl leading-none text-bureau-fg sm:text-4xl">
                    {profile.agentId}
                  </h1>
                  <span
                    title={`Calibration rating ${t.label}`}
                    aria-label={`Calibration rating ${t.label}`}
                    className="grid h-8 min-w-8 rotate-[-4deg] place-items-center border px-2 font-serifd text-lg"
                    style={{ borderColor: color, color }}
                  >
                    {isRogue ? '✕' : t.label}
                  </span>
                  {isRogue && (
                    <span
                      title="Flagged as rogue: silenced in consensus"
                      aria-label="Flagged as rogue: silenced in consensus"
                      className="border border-fall px-2 py-0.5 font-monod text-[10px] uppercase tracking-[0.18em] text-fall"
                    >
                      Rogue
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 font-monod text-[10px] uppercase tracking-[0.2em] text-bureau-muted">
                  {erc ? (
                    <span className="text-brass">identity Nº {erc}</span>
                  ) : (
                    <span className="text-bureau-muted/60">unregistered identity</span>
                  )}
                  <span>{profile.count} windows scored</span>
                  <span className="text-bureau-muted/60">
                    {selected === ALL ? 'aggregate · all markets' : `market · ${selected}`}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-px border border-bureau-line bg-bureau-line">
              <Stat label="Brier" value={profile.brier.toFixed(3)} hint="lower better" />
              <Stat label="Hit rate" value={`${Math.round(profile.hitRate * 100)}%`} />
              <Stat label="Vote weight" value={`${Math.round(weightShare * 100)}%`} />
            </div>
          </div>
        </header>

        {/* Market tabs — mono-caps with brass active underline */}
        <div
          role="tablist"
          aria-label="Filter agent profile by market"
          className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-bureau-line"
        >
          {tabs.map((tab) => {
            const active = tab.marketId === selected;
            return (
              <button
                key={tab.marketId}
                type="button"
                role="tab"
                onClick={() => setSelected(tab.marketId)}
                aria-selected={active}
                className={`-mb-px border-b-2 pb-2.5 pt-1 font-monod text-[11px] uppercase tracking-[0.2em] transition-colors ${
                  active
                    ? 'border-brass text-brass'
                    : 'border-transparent text-bureau-muted hover:text-bureau-fg'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
          {loading && (
            <span role="status" aria-live="polite" className="font-monod text-[10px] uppercase tracking-[0.3em] text-bureau-muted">
              loading…
            </span>
          )}
        </div>

        {/* Reputation curve */}
        <section className="mt-8">
          <ReputationCurve data={profile.reputationCurve} />
        </section>

        {/* Reliability diagram — the quant showpiece */}
        <section className="mt-6">
          <ReliabilityDiagram data={profile.reliability} />
        </section>

        {/* Recent signals strip */}
        <section className="mt-8">
          <div className="mb-4 flex items-end justify-between">
            <h3 className="font-serifd text-xl text-bureau-fg">Recent signals</h3>
            <span className="font-monod text-[10px] uppercase tracking-[0.3em] text-bureau-muted">
              predicted probability · realized outcome
            </span>
          </div>
          {profile.recentSignals.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {profile.recentSignals.map((s, i) => {
                const hit = (s.prob >= 0.5) === (s.outcome >= 0.5);
                const c = hit ? 'var(--color-rise)' : 'var(--color-fall)';
                return (
                  <div
                    key={`${s.ts}-${i}`}
                    className="flex min-w-[112px] flex-col gap-1.5 border border-bureau-line bg-bureau-panel p-3"
                    style={{ borderColor: hit ? 'color-mix(in oklab, var(--color-rise) 35%, transparent)' : 'color-mix(in oklab, var(--color-fall) 35%, transparent)' }}
                  >
                    <div className="font-monod text-[10px] uppercase tracking-[0.18em] text-bureau-muted">{fmtTs(s.ts)}</div>
                    <div className="font-monod text-lg font-bold" style={{ color: c }}>
                      {(s.prob * 100).toFixed(0)}%
                    </div>
                    <div className="h-1.5 w-full overflow-hidden bg-bureau-line/60">
                      <div className="h-full" style={{ width: `${Math.round(s.prob * 100)}%`, background: c }} />
                    </div>
                    <div className="font-monod text-[10px] uppercase tracking-[0.18em] text-bureau-muted">
                      outcome <span style={{ color: c }}>{s.outcome >= 0.5 ? 'up' : 'down'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bureau-frame p-6 font-monod text-sm text-bureau-muted">
              <div className="bureau-grain" aria-hidden />
              no recent signals
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-bureau-panel px-4 py-3 text-center">
      <div className="font-monod text-[9px] uppercase tracking-[0.24em] text-bureau-muted">{label}</div>
      <div className="mt-1 font-serifd text-2xl leading-none text-bureau-fg">{value}</div>
      {hint && <div className="mt-1 font-monod text-[9px] uppercase tracking-[0.18em] text-bureau-muted/60">{hint}</div>}
    </div>
  );
}
