import deployment from '../../../deployments/mantle-sepolia.json';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

type Consensus = {
  direction: string;
  sizeBps: number;
  confidence: number;
  contributors: string[];
  source?: string;
  timestamp?: number;
};

type AgentRow = {
  agentId: string;
  erc8004AgentId?: string | null;
  brier: number;
  reputationWeight: number;
  weightShare: number;
  isRogue: boolean;
};

type Trade = {
  id: string;
  timestamp: number;
  symbol: string;
  direction: string;
  sizeBps: number;
  confidence: number;
  contributors: string[];
};

type Verification = { status: string; datasetHash?: string; generatedAt?: string; rows?: number; scoringVersion?: string };
type ChainStatus = {
  status: string;
  ledgerAddress?: string;
  network?: string;
  explorer?: string;
  owner?: string;
  onchainLatestDatasetHash?: string;
  localLatestDatasetHash?: string | null;
  isSynced?: boolean;
  message?: string;
};

const COLORS = {
  card: '#141925',
  border: '#222a3a',
  muted: '#8b93a7',
  green: '#2fd47b',
  red: '#ff5d6c',
  gray: '#6b7280',
  blue: '#4c8dff',
  yellow: '#f5c451'
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

function short(v?: string | null): string {
  if (!v) return '—';
  return v.length < 18 ? v : `${v.slice(0, 10)}…${v.slice(-8)}`;
}

/// Derive the explorer base (e.g. https://explorer.sepolia.mantle.xyz) from chain.status's
/// address URL, falling back to the committed deployment record.
function explorerBase(chain: ChainStatus): string {
  if (chain.explorer) return chain.explorer.replace(/\/(address|tx)\/.*/i, '');
  return deployment.explorer;
}

function dirColor(d: string): string {
  return d === 'LONG' ? COLORS.green : d === 'SHORT' ? COLORS.red : COLORS.gray;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 14,
        padding: 20,
        marginBottom: 16
      }}
    >
      <h2 style={{ margin: '0 0 14px', fontSize: 14, letterSpacing: 0.6, textTransform: 'uppercase', color: COLORS.muted }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function Page() {
  const [consensus, agents, trades, verification, chain] = await Promise.all([
    safeFetch<Consensus>('/consensus/latest', { direction: 'FLAT', sizeBps: 0, confidence: 0.5, contributors: [] }),
    safeFetch<AgentRow[]>('/agents', []),
    safeFetch<Trade[]>('/trades', []),
    safeFetch<Verification>('/verification', { status: 'pending' }),
    safeFetch<ChainStatus>('/chain/status', { status: 'pending' })
  ]);

  const confidencePct = Math.round(consensus.confidence * 1000) / 10;
  const topAgent = agents[0];
  const rogue = agents.find((a) => a.isRogue);

  const base = explorerBase(chain);
  const ledgerAddress = chain.ledgerAddress ?? deployment.contracts.SibylLedger.address;
  const ledgerUrl = `${base}/address/${ledgerAddress}`;
  const consensusTx = deployment.latestConsensus?.tx;
  const consensusUrl = consensusTx ? `${base}/tx/${consensusTx}` : undefined;

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '32px 24px 64px' }}>
      {/* Hero */}
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: COLORS.blue, fontWeight: 600, letterSpacing: 1 }}>SIBYL · PROOF-OF-EDGE</div>
        <h1 style={{ margin: '6px 0 8px', fontSize: 30 }}>On-Chain Proof-of-Edge for AI Trading Agents</h1>
        <p style={{ margin: 0, color: COLORS.muted, fontSize: 16 }}>
          Don&apos;t trust the loudest agent. Trust the one with a track record you can verify.
        </p>
      </header>

      {/* Consensus */}
      <Card title="Live Consensus">
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div
            style={{
              background: dirColor(consensus.direction),
              color: '#0b0e14',
              fontWeight: 800,
              fontSize: 22,
              padding: '10px 20px',
              borderRadius: 10,
              minWidth: 90,
              textAlign: 'center'
            }}
          >
            {consensus.direction}
          </div>
          <div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>POSITION SIZE</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{consensus.sizeBps} bps</div>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 6 }}>
              LONG CONFIDENCE · {confidencePct}%
            </div>
            <div style={{ position: 'relative', height: 10, background: '#0b0e14', borderRadius: 6, overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${confidencePct}%`,
                  background: dirColor(consensus.direction)
                }}
              />
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: COLORS.muted }} />
            </div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 6 }}>
              {consensus.contributors.length} contributing agents · 50% line = no edge
            </div>
          </div>
        </div>
      </Card>

      {/* The beat */}
      {topAgent && rogue && (
        <div
          style={{
            background: 'rgba(76,141,255,0.08)',
            border: `1px solid ${COLORS.blue}`,
            borderRadius: 14,
            padding: '14px 18px',
            marginBottom: 16,
            fontSize: 15
          }}
        >
          <b>Reputation is the steering wheel.</b> The best-calibrated agent{' '}
          <b style={{ color: COLORS.green }}>{topAgent.agentId}</b> carries{' '}
          <b>{Math.round(topAgent.weightShare * 100)}%</b> of the vote, while the loud, overconfident{' '}
          <b style={{ color: COLORS.red }}>{rogue.agentId}</b> (worst Brier {rogue.brier.toFixed(3)}) is
          down-weighted to just <b>{Math.round(rogue.weightShare * 100)}%</b> — the chain silences it.
        </div>
      )}

      {/* Leaderboard */}
      <Card title="Agent Reputation Leaderboard">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ color: COLORS.muted, textAlign: 'left', fontSize: 12 }}>
              <th style={{ padding: '6px 8px' }}>#</th>
              <th style={{ padding: '6px 8px' }}>Agent</th>
              <th style={{ padding: '6px 8px' }}>ERC-8004 ID</th>
              <th style={{ padding: '6px 8px' }}>Brier</th>
              <th style={{ padding: '6px 8px', width: '40%' }}>Consensus weight (capped)</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a, i) => (
              <tr key={a.agentId} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <td style={{ padding: '10px 8px', color: COLORS.muted }}>{i + 1}</td>
                <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                  {a.agentId}
                  {a.isRogue && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: COLORS.red,
                        border: `1px solid ${COLORS.red}`,
                        borderRadius: 6,
                        padding: '1px 6px'
                      }}
                    >
                      ROGUE
                    </span>
                  )}
                </td>
                <td style={{ padding: '10px 8px', color: COLORS.muted, fontFamily: 'ui-monospace, monospace' }}>
                  {a.erc8004AgentId ? `#${a.erc8004AgentId}` : '—'}
                </td>
                <td style={{ padding: '10px 8px', color: a.isRogue ? COLORS.red : COLORS.green }}>{a.brier.toFixed(3)}</td>
                <td style={{ padding: '10px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 8, background: '#0b0e14', borderRadius: 5, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.max(2, a.weightShare * 100)}%`,
                          height: '100%',
                          background: a.isRogue ? COLORS.red : COLORS.blue
                        }}
                      />
                    </div>
                    <span style={{ minWidth: 42, textAlign: 'right', color: COLORS.muted }}>
                      {Math.round(a.weightShare * 100)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 16, color: COLORS.muted }}>
                  No replay scores yet — run <code>pnpm demo:seed</code>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* On-chain */}
      <Card title="On-chain">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <a
            href={ledgerUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              flex: 1,
              minWidth: 240,
              textDecoration: 'none',
              color: 'inherit',
              background: '#0b0e14',
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              padding: '12px 14px'
            }}
          >
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>SIBYL LEDGER</div>
            <div style={{ fontFamily: 'ui-monospace, monospace', color: COLORS.blue, fontSize: 14 }}>
              {short(ledgerAddress)} ↗
            </div>
          </a>
          <a
            href={consensusUrl ?? ledgerUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              flex: 1,
              minWidth: 240,
              textDecoration: 'none',
              color: 'inherit',
              background: '#0b0e14',
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              padding: '12px 14px'
            }}
          >
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>LATEST CONSENSUS TX</div>
            <div style={{ fontFamily: 'ui-monospace, monospace', color: COLORS.blue, fontSize: 14 }}>
              {consensusTx ? `${short(consensusTx)} ↗` : '—'}
            </div>
          </a>
        </div>
        <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 10 }}>
          {chain.network ?? deployment.network} · chain {deployment.chainId} · decisions recorded on Mantle
        </div>
      </Card>

      {/* Verification + Chain side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="Verification">
          <Row label="Status" value={verification.status} />
          {verification.datasetHash && <Row label="Dataset hash" value={short(verification.datasetHash)} mono />}
          {verification.rows !== undefined && <Row label="Windows scored" value={String(verification.rows)} />}
          {verification.scoringVersion && <Row label="Scoring version" value={verification.scoringVersion} />}
          {verification.generatedAt && <Row label="Generated" value={verification.generatedAt} />}
        </Card>
        <Card title="Chain Sync">
          <Row label="Status" value={chain.status} />
          {chain.message && <Row label="Note" value={chain.message} />}
          {chain.ledgerAddress && <Row label="Ledger" value={short(chain.ledgerAddress)} mono />}
          {chain.owner && <Row label="Owner" value={short(chain.owner)} mono />}
          {chain.onchainLatestDatasetHash && <Row label="On-chain hash" value={short(chain.onchainLatestDatasetHash)} mono />}
          {chain.isSynced !== undefined && <Row label="Synced" value={chain.isSynced ? 'Yes' : 'No'} />}
        </Card>
      </div>

      {/* Trades */}
      <Card title="Recent Trades (paper)">
        {trades.length === 0 ? (
          <div style={{ color: COLORS.muted }}>No trades yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ color: COLORS.muted, textAlign: 'left', fontSize: 12 }}>
                <th style={{ padding: '6px 8px' }}>Symbol</th>
                <th style={{ padding: '6px 8px' }}>Direction</th>
                <th style={{ padding: '6px 8px' }}>Size</th>
                <th style={{ padding: '6px 8px' }}>Confidence</th>
                <th style={{ padding: '6px 8px' }}>Contributors</th>
              </tr>
            </thead>
            <tbody>
              {trades.slice(0, 6).map((t) => (
                <tr key={t.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                  <td style={{ padding: '8px' }}>{t.symbol}</td>
                  <td style={{ padding: '8px', color: dirColor(t.direction), fontWeight: 600 }}>{t.direction}</td>
                  <td style={{ padding: '8px' }}>{t.sizeBps} bps</td>
                  <td style={{ padding: '8px' }}>{Math.round(t.confidence * 1000) / 10}%</td>
                  <td style={{ padding: '8px', color: COLORS.muted }}>{t.contributors.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <footer style={{ color: COLORS.muted, fontSize: 12, textAlign: 'center', marginTop: 24 }}>
        Reputation-weighted consensus · re-runnable replay · on-chain verifiable · Mantle
      </footer>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontSize: 14 }}>
      <span style={{ color: COLORS.muted }}>{label}</span>
      <span style={{ fontFamily: mono ? 'ui-monospace, monospace' : 'inherit', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
