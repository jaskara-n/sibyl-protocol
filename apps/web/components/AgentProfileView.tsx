'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, type AgentProfile, type AgentRow, type Market } from '../lib/api';
import { tier } from '../lib/utils';
import { AgentAvatar } from './AgentAvatar';
import { ReputationCurve } from './ReputationCurve';
import { ReliabilityDiagram } from './ReliabilityDiagram';

const ALL = '__all__';

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

  const tabs = useMemo(
    () => [{ marketId: ALL, label: 'all markets' }, ...markets.map((m) => ({ marketId: m.marketId, label: m.name ?? m.marketId }))],
    [markets]
  );

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24">
      <div className="pt-6">
        <Link href="/agents" className="font-mono text-xs text-muted transition-colors hover:text-fg">
          ← agents
        </Link>
      </div>

      {/* Glass header */}
      <header className="glass glow-brand mt-3 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <AgentAvatar id={profile.agentId} size={76} ring={t.color} />
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="truncate font-display text-3xl font-bold tracking-tight">{profile.agentId}</h1>
                <span
                  className="grid h-7 min-w-7 place-items-center rounded-md px-2 font-mono text-sm font-bold text-ink"
                  style={{ background: t.color, boxShadow: `0 0 16px -2px ${t.color}` }}
                >
                  {t.label}
                </span>
                {isRogue && (
                  <span className="rounded border border-short/50 px-2 py-0.5 text-[11px] font-semibold text-short">
                    ROGUE
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 font-mono text-xs text-muted">
                {erc ? (
                  <span className="text-cyan/90">ERC-8004 #{erc}</span>
                ) : (
                  <span className="text-muted/60">unregistered identity</span>
                )}
                <span>{profile.count} windows scored</span>
                <span className="text-muted/60">
                  {selected === ALL ? 'aggregate · all markets' : `market · ${selected}`}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-5">
            <Stat label="Brier" value={profile.brier.toFixed(3)} hint="lower better" accent="text-brand" />
            <Stat label="Hit rate" value={`${Math.round(profile.hitRate * 100)}%`} accent="text-long" />
            <Stat label="Vote weight" value={`${Math.round(weightShare * 100)}%`} accent="text-cyan" />
          </div>
        </div>
      </header>

      {/* Market tabs */}
      <nav className="mt-5 flex flex-wrap items-center gap-2">
        {tabs.map((tab) => {
          const active = tab.marketId === selected;
          return (
            <button
              key={tab.marketId}
              type="button"
              onClick={() => setSelected(tab.marketId)}
              aria-pressed={active}
              className={`rounded-full border px-3.5 py-1.5 font-mono text-xs transition-all ${
                active
                  ? 'border-brand/60 bg-brand/15 text-brand shadow-[0_0_18px_-8px_rgba(139,92,246,0.8)]'
                  : 'border-line bg-card/60 text-muted hover:border-brand/40 hover:text-fg'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
        {loading && <span className="font-mono text-xs text-muted">loading…</span>}
      </nav>

      {/* Reputation curve */}
      <section className="mt-6">
        <ReputationCurve data={profile.reputationCurve} />
      </section>

      {/* Reliability diagram — the quant showpiece */}
      <section className="mt-6">
        <ReliabilityDiagram data={profile.reliability} />
      </section>

      {/* Recent signals strip */}
      <section className="mt-6">
        <div className="mb-3 flex items-end justify-between">
          <h3 className="font-display text-lg font-semibold">Recent signals</h3>
          <span className="font-mono text-xs text-muted">predicted probability · realized outcome</span>
        </div>
        {profile.recentSignals.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {profile.recentSignals.map((s, i) => {
              const hit = (s.prob >= 0.5) === (s.outcome >= 0.5);
              const c = hit ? '#2fe3a0' : '#ff5470';
              return (
                <div
                  key={`${s.ts}-${i}`}
                  className="flex min-w-[112px] flex-col gap-1.5 rounded-xl border border-line bg-card/60 p-3"
                  style={{ borderColor: hit ? 'rgba(47,227,160,0.25)' : 'rgba(255,84,112,0.25)' }}
                >
                  <div className="font-mono text-[10px] text-muted">{fmtTs(s.ts)}</div>
                  <div className="font-mono text-lg font-bold" style={{ color: c }}>
                    {(s.prob * 100).toFixed(0)}%
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink">
                    <div className="h-full rounded-full" style={{ width: `${Math.round(s.prob * 100)}%`, background: c }} />
                  </div>
                  <div className="font-mono text-[10px] text-muted">
                    outcome <span style={{ color: c }}>{s.outcome >= 0.5 ? 'up' : 'down'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass rounded-xl p-6 font-mono text-sm text-muted">no recent signals</div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card/40 px-4 py-3 text-center">
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-1 font-mono text-xl font-bold ${accent ?? 'text-fg'}`}>{value}</div>
      {hint && <div className="mt-0.5 font-mono text-[9px] text-muted/60">{hint}</div>}
    </div>
  );
}
