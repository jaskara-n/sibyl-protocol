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
      <div className="relative z-0 bg-bureau text-bureau-fg">
        <div className="mx-auto max-w-6xl px-5 pb-24 pt-16">
          <div className="bureau-frame p-10 text-center">
            <div className="bureau-grain" aria-hidden />
            <p className="font-monod text-[11px] uppercase tracking-[0.42em] text-brass">No record</p>
            <div className="mt-3 font-serifd text-3xl">Agent not found</div>
            <p className="mt-2 font-sansd text-sm text-bureau-muted">
              No reputation record for <span className="font-monod text-bureau-fg">{id}</span>.
            </p>
            <Link
              href="/agents"
              className="mt-6 inline-block border border-bureau-line px-6 py-3 font-sansd text-sm font-semibold text-bureau-fg transition-colors hover:border-brass hover:text-brass"
            >
              ← Back to agents
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AgentProfileView id={id} initialProfile={profile} agg={profile} markets={markets} row={row} />
  );
}
