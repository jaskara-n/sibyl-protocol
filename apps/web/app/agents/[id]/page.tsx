import Link from 'next/link';
import { api, type AgentProfile, type AgentRow, type Market } from '../../../lib/api';
import { AgentProfileView } from '../../../components/AgentProfileView';

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

  const [profile, agents, markets] = await Promise.all([
    api<AgentProfile>('/agents/' + encodeURIComponent(id) + '/profile', fallback),
    api<AgentRow[]>('/agents', []),
    api<Market[]>('/markets', [])
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

  return (
    <AgentProfileView id={id} initialProfile={profile} agg={profile} markets={markets} row={row} />
  );
}
