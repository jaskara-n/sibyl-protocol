const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

type Consensus = {
  direction: string;
  sizeBps: number;
  confidence: number;
  contributors: string[];
};

type AgentRow = {
  agentId: string;
  brier: number;
  reputationWeight: number;
};

async function safeFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export default async function Page() {
  const [consensus, agents, trades] = await Promise.all([
    safeFetch<Consensus>('/consensus/latest', { direction: 'FLAT', sizeBps: 0, confidence: 0.5, contributors: [] }),
    safeFetch<AgentRow[]>('/agents', []),
    safeFetch<any[]>('/trades', [])
  ]);

  return (
    <main style={{ maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>Sibyl Dashboard</h1>
      <p>Don&apos;t trust the loudest agent. Trust the one with verifiable track record.</p>

      <section style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2>Consensus</h2>
        <p>
          Direction: <b>{consensus.direction}</b> | Size: <b>{consensus.sizeBps} bps</b> | Confidence:{' '}
          <b>{Math.round(consensus.confidence * 100)}%</b>
        </p>
      </section>

      <section style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2>Agent Reputation (Brier)</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', paddingBottom: 8 }}>Agent</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', paddingBottom: 8 }}>Brier</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', paddingBottom: 8 }}>Weight</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.agentId}>
                <td style={{ padding: '8px 0' }}>{agent.agentId}</td>
                <td>{agent.brier}</td>
                <td>{agent.reputationWeight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ background: 'white', borderRadius: 12, padding: 16 }}>
        <h2>Recent Trades</h2>
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(trades.slice(0, 5), null, 2)}</pre>
      </section>
    </main>
  );
}
