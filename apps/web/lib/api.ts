const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export type Consensus = {
  direction: string;
  sizeBps: number;
  confidence: number;
  contributors: string[];
  source?: string;
  timestamp?: number;
};

export type AgentRow = {
  agentId: string;
  erc8004AgentId?: string | null;
  brier: number;
  brierPpm?: number;
  reputationWeight: number;
  weightShare: number;
  isRogue: boolean;
};

export type Trade = {
  id: string;
  timestamp: number;
  symbol: string;
  direction: string;
  sizeBps: number;
  confidence: number;
  contributors: string[];
};

export type Verification = {
  status: string;
  datasetHash?: string;
  generatedAt?: string;
  rows?: number;
  scoringVersion?: string;
};

export type ChainStatus = {
  status: string;
  ledgerAddress?: string;
  network?: string;
  explorer?: string;
  owner?: string;
  scoringVersion?: number;
  epoch?: number;
  onchainLatestDatasetHash?: string;
  localLatestDatasetHash?: string | null;
  isSynced?: boolean;
  message?: string;
};

export async function api<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}
