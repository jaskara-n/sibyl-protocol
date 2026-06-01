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

type Verification = {
  status: string;
  datasetHash?: string;
  generatedAt?: string;
  rows?: number;
};

type ChainStatus = {
  status: string;
  ledgerAddress?: string;
  owner?: string;
  onchainLatestDatasetHash?: string;
  localLatestDatasetHash?: string | null;
  isSynced?: boolean;
  message?: string;
};

type CommitCalldata = {
  status: string;
  calldata?: string;
  message?: string;
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

function short(value?: string | null): string {
  if (!value) return '-';
  if (value.length < 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

export default async function Page() {
  const [consensus, agents, trades, verification, chainStatus, commitCalldata] = await Promise.all([
    safeFetch<Consensus>('/consensus/latest', { direction: 'FLAT', sizeBps: 0, confidence: 0.5, contributors: [] }),
    safeFetch<AgentRow[]>('/agents', []),
    safeFetch<any[]>('/trades', []),
    safeFetch<Verification>('/verification', { status: 'pending' }),
    safeFetch<ChainStatus>('/chain/status', { status: 'pending' }),
    safeFetch<CommitCalldata>('/verification/commit-calldata', { status: 'pending' })
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
        <h2>Verification</h2>
        <p>Status: <b>{verification.status}</b></p>
        {verification.datasetHash && <p>Dataset hash: <code>{verification.datasetHash}</code></p>}
        {verification.generatedAt && <p>Generated: {verification.generatedAt}</p>}
        {verification.rows !== undefined && <p>Rows: {verification.rows}</p>}
      </section>

      <section style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2>Chain Sync</h2>
        <p>Status: <b>{chainStatus.status}</b></p>
        {chainStatus.message && <p>{chainStatus.message}</p>}
        {chainStatus.ledgerAddress && <p>Ledger: <code>{chainStatus.ledgerAddress}</code></p>}
        {chainStatus.owner && <p>Owner: <code>{short(chainStatus.owner)}</code></p>}
        {chainStatus.onchainLatestDatasetHash && (
          <p>On-chain hash: <code>{short(chainStatus.onchainLatestDatasetHash)}</code></p>
        )}
        {chainStatus.localLatestDatasetHash && (
          <p>Local hash: <code>{short(chainStatus.localLatestDatasetHash)}</code></p>
        )}
        {chainStatus.isSynced !== undefined && (
          <p>Synced: <b>{chainStatus.isSynced ? 'Yes' : 'No'}</b></p>
        )}
      </section>

      <section style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2>Commit Calldata</h2>
        <p>Status: <b>{commitCalldata.status}</b></p>
        {commitCalldata.message && <p>{commitCalldata.message}</p>}
        {commitCalldata.calldata && (
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{commitCalldata.calldata}</pre>
        )}
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
