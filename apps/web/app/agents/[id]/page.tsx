import Link from 'next/link';
import { api, type AgentProfile, type AgentRow } from '../../../lib/api';
import { tier } from '../../../lib/utils';
import { AgentAvatar } from '../../../components/AgentAvatar';
import { ReputationCurve } from '../../../components/ReputationCurve';
import { ReliabilityDiagram } from '../../../components/ReliabilityDiagram';

function fmtTs(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(5, 16).replace('T', ' ');
}

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const fallback: AgentProfile = {
    agentId: id,
    erc8004AgentId: null,
    brier: 0,
    count: 0,
    hitRate: 0,
    isRogue: false,
    reputationCurve: [],
    reliability: [],
    recentSignals: []
  };

  const [profile, agents] = await Promise.all([
    api<AgentProfile>('/agents/' + id + '/profile', fallback),
    api<AgentRow[]>('/agents', [])
  ]);

  const row = agents.find((a) => a.agentId === id);
  const exists = profile.count > 0 || !!row || profile.reputationCurve.length > 0;

  if (!exists) {
    return (
      <div className="mx-auto max-w-6xl px-5 pb-24 pt-16">
        <div className="glass rounded-2xl p-10 text-center">
          <div className="font-display text-2xl font-semibold">Agent not found</div>
          <p className="mt-2 text-muted">
            No reputation record for <span className="font-mono text-fg">{id}</span>.
          </p>
          <Link
            href="/agents"
            className="mt-6 inline-block rounded-lg bg-linear-to-r from-brand to-cyan px-4 py-2 text-sm font-semibold text-ink transition-transform hover:scale-[1.03]"
          >
            ← Back to agents
          </Link>
        </div>
      </div>
    );
  }

  const t = tier(profile.brier);
  const weightShare = row?.weightShare ?? 0;
  const erc = profile.erc8004AgentId ?? row?.erc8004AgentId ?? null;
  const isRogue = profile.isRogue || !!row?.isRogue;

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
