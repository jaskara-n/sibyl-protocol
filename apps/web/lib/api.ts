const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export type Consensus = {
  direction: string;
  sizeBps: number;
  confidence: number;
  contributors: string[];
  source?: string;
  timestamp?: number;
  marketId?: string;
};

export type AgentRow = {
  agentId: string;
  erc8004AgentId?: string | null;
  brier: number;
  brierPpm?: number;
  reputationWeight: number;
  weightShare: number;
  isRogue: boolean;
  marketId?: string;
};

export type Market = {
  marketId: string;
  name?: string;
  active: boolean;
  conviction: { totalWeight: string; activeAgentCount: number };
};

export type VaultNav = {
  totalAssets: string;
  cash: string;
  sharePrice: string;
};

export type VaultPosition = {
  marketId: string;
  value: string;
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
  latestConsensusTx?: string;
  message?: string;
};

/** Per-agent analytics derived from the frozen replay dataset. */
export type AgentProfile = {
  agentId: string;
  erc8004AgentId?: string | null;
  brier: number;
  count: number;
  hitRate: number;
  isRogue: boolean;
  /** Cumulative Brier as windows accrue (the reputation trajectory). */
  reputationCurve: { window: number; cumBrier: number }[];
  /** Calibration reliability diagram: predicted-mean vs actual-frequency per probability bucket. */
  reliability: { bucket: number; predicted: number; actual: number; n: number }[];
  recentSignals: { ts: number; prob: number; outcome: number }[];
};

/** A consensus decision (round outcome). */
export type Decision = {
  id: string;
  timestamp: number;
  symbol: string;
  direction: string;
  sizeBps: number;
  confidence: number;
  contributors: number;
  txHash?: string;
  marketId?: string;
};

/**
 * A binary prediction market enriched with LIVE on-chain state. Mirrors the API
 * `PredictionMarketResponse` shape (apps/api/src/predictions/predictions.controller.ts).
 * All uint256 values arrive as decimal strings to survive JSON without precision loss.
 */
export type Prediction = {
  source: 'chain' | 'fallback';
  marketId: string;
  marketIdHex: `0x${string}`;
  question: string | null;
  fpmm: `0x${string}` | null;
  collateral: `0x${string}` | null;
  resolver: `0x${string}` | null;
  resolveTime: number | null;
  /** On-chain outcome code: 0=UNRESOLVED, 1=YES, 2=NO, 3=INVALID. null when not read. */
  outcome: number | null;
  outcomeLabel: string | null;
  resolved: boolean | null;
  /** Implied YES probability as a 0..100 percent number. null when not read. */
  priceYesPct: number | null;
  reserveYes: string | null;
  reserveNo: string | null;
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
