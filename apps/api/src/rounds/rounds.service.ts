import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Observable, Subject, filter, map } from 'rxjs';
import { getAddress, keccak256, toBytes, type Hex } from 'viem';
import { computeConsensusPpm, toPpm } from '@sibyl/shared';
import { DEFAULT_AGENTS, type AgentInput } from '@sibyl/agents';
import { emitConsensusOnchain, toAgentId, type OnchainSignal } from '@sibyl/sdk';
import { listMarkets, readReplayArtifact, scoresForMarket } from '../lib/artifacts.js';

/**
 * The LIVE round engine — the continuous on-the-record benchmark.
 *
 * Every ROUND_SECONDS, per market:
 *   1. resolve the open round against the realized price move (up=1 / down=0),
 *      scoring every agent's stated probability (Brier increment) and updating its
 *      LIVE reputation (replay prior + session evidence),
 *   2. open a new round: agents read a live market snapshot (Bybit public API,
 *      deterministic synthetic fallback offline) and stake fresh predictions,
 *   3. compute the reputation-weighted consensus (canonical ppm kernel) using LIVE briers,
 *   4. broadcast round_open / round_resolved over SSE and persist a trimmed history.
 *
 * Reputation here is the SESSION view (seeded from the committed replay so it starts
 * credible and visibly evolves); the canonical record remains the on-chain commit.
 */

export type LivePrediction = {
  agentId: string;
  direction: 'LONG' | 'SHORT' | 'FLAT';
  probability: number;
  /** Stated probability that price closes UP (long side), in [0,1]. */
  pUp: number;
};

export type LiveResult = {
  agentId: string;
  pUp: number;
  brierDelta: number;
  correct: boolean;
  liveBrier: number;
};

export type LiveConsensus = {
  direction: 'LONG' | 'SHORT' | 'FLAT';
  sizeBps: number;
  confidence: number;
  contributorCount: number;
};

export type LiveRound = {
  id: number;
  market: string;
  openedAt: number;
  closesAt: number;
  openPrice: number;
  predictions: LivePrediction[];
  consensus: LiveConsensus;
  closePrice?: number;
  outcome?: 0 | 1;
  resolvedAt?: number;
  consensusCorrect?: boolean;
  results?: LiveResult[];
  /** emitConsensus tx hash when this round's house call was recorded on Mantle. */
  chainTx?: string;
};

export type LiveReputation = {
  agentId: string;
  liveBrier: number;
  rounds: number;
  isRogue: boolean;
};

export type RoundEvent = {
  type: 'round_open' | 'round_resolved';
  market: string;
  round: LiveRound;
  reputation: LiveReputation[];
};

type RepState = { brierSum: number; n: number };

type Persisted = {
  nextId: number;
  rounds: LiveRound[];
  reputation: Record<string, Record<string, RepState>>;
};

const PERSIST_PATH = resolve(process.cwd(), '../../data/artifacts/live-rounds.json');
const HISTORY_LIMIT = 120;
/** Pseudo-sample weight of the committed replay prior, so live scores start credible but move. */
const PRIOR_N = 40;

const DIRS = ['FLAT', 'LONG', 'SHORT'] as const;

function bybitSymbol(market: string): string {
  return market.replace('-USD', 'USDT').replace('-', '');
}

@Injectable()
export class RoundsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private readonly events$ = new Subject<RoundEvent>();
  private nextId = 1;
  private current = new Map<string, LiveRound>();
  private history: LiveRound[] = [];
  /** market -> agentId -> rolling brier state (seeded from the replay prior). */
  private rep = new Map<string, Map<string, RepState>>();
  private lastPrice = new Map<string, number>();

  readonly roundSeconds = Math.max(10, Number(process.env.ROUND_SECONDS ?? 60));
  readonly enabled = process.env.ROUNDS_ENABLED !== 'false';

  /** On-chain recording: ROUNDS_CHAIN_EMIT=1 + PRIVATE_KEY (ledger owner) broadcasts the
   *  live house call via emitConsensus, throttled per market so gas stays sane. */
  private readonly chainKey = (process.env.ROUNDS_CHAIN_EMIT === '1' ? process.env.PRIVATE_KEY : undefined) as
    | Hex
    | undefined;
  private readonly chainEmitIntervalMs =
    Math.max(60, Number(process.env.ROUNDS_CHAIN_EMIT_INTERVAL_SEC ?? 600)) * 1000;
  private lastChainEmit = new Map<string, number>();
  private ledgerAddr: `0x${string}` | null | undefined;

  onModuleInit(): void {
    this.load();
    this.seedReputation();
    if (!this.enabled) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.roundSeconds * 1000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.events$.complete();
  }

  /*//////////////////////////// public surface ////////////////////////////*/

  state(market?: string) {
    const markets = market ? [market] : listMarkets();
    return {
      roundSeconds: this.roundSeconds,
      markets: markets.map((m) => ({
        market: m,
        current: this.current.get(m) ?? null,
        reputation: this.reputationFor(m),
        history: this.history.filter((r) => r.market === m).slice(0, 24)
      }))
    };
  }

  stream(market?: string): Observable<{ data: RoundEvent }> {
    return this.events$.pipe(
      filter((e) => !market || e.market === market),
      map((e) => ({ data: e }))
    );
  }

  /*//////////////////////////// engine ////////////////////////////*/

  private async tick(): Promise<void> {
    for (const market of listMarkets()) {
      try {
        const snapshot = await this.snapshot(market);
        const open = this.current.get(market);
        if (open) this.resolveRound(open, snapshot.price);
        await this.openRound(market, snapshot);
      } catch {
        // engine must never die on a bad tick; next interval retries
      }
    }
    this.persist();
  }

  private resolveRound(round: LiveRound, closePrice: number): void {
    const outcome: 0 | 1 = closePrice > round.openPrice ? 1 : 0;
    const repMap = this.rep.get(round.market)!;

    round.closePrice = closePrice;
    round.outcome = outcome;
    round.resolvedAt = Date.now();
    round.consensusCorrect =
      round.consensus.direction === 'FLAT' ? undefined : (round.consensus.direction === 'LONG') === (outcome === 1);

    round.results = round.predictions.map((p) => {
      const brierDelta = (p.pUp - outcome) ** 2;
      const state = repMap.get(p.agentId) ?? { brierSum: 0.25 * PRIOR_N, n: PRIOR_N };
      state.brierSum += brierDelta;
      state.n += 1;
      repMap.set(p.agentId, state);
      return {
        agentId: p.agentId,
        pUp: p.pUp,
        brierDelta: Number(brierDelta.toFixed(4)),
        correct: Math.round(p.pUp) === outcome,
        liveBrier: Number((state.brierSum / state.n).toFixed(4))
      };
    });

    this.history.unshift(round);
    this.history = this.history.slice(0, HISTORY_LIMIT);
    this.current.delete(round.market);
    this.events$.next({
      type: 'round_resolved',
      market: round.market,
      round,
      reputation: this.reputationFor(round.market)
    });
  }

  private async openRound(market: string, snapshot: AgentInput): Promise<void> {
    const signals = await Promise.all(DEFAULT_AGENTS.map((a) => a.run(snapshot)));
    const predictions: LivePrediction[] = signals.map((s) => ({
      agentId: s.agentId,
      direction: s.direction,
      probability: Number(s.probability.toFixed(4)),
      pUp: Number((s.direction === 'SHORT' ? 1 - s.probability : s.probability).toFixed(4))
    }));

    const repMap = this.rep.get(market)!;
    const brierPpm = predictions.map((p) => {
      const st = repMap.get(p.agentId);
      return toPpm(st ? st.brierSum / st.n : 0.25);
    });
    const c = computeConsensusPpm(
      brierPpm,
      predictions.map((p) => p.direction !== 'SHORT'),
      predictions.map((p) => toPpm(p.probability))
    );

    const now = Date.now();
    const round: LiveRound = {
      id: this.nextId++,
      market,
      openedAt: now,
      closesAt: now + this.roundSeconds * 1000,
      openPrice: snapshot.price,
      predictions,
      consensus: {
        direction: DIRS[c.direction],
        sizeBps: c.sizeBps,
        confidence: c.confidencePpm / 1_000_000,
        contributorCount: c.contributorCount
      }
    };
    this.current.set(market, round);
    this.events$.next({ type: 'round_open', market, round, reputation: this.reputationFor(market) });
    this.maybeEmitOnchain(round);
  }

  /*//////////////////////////// on-chain record ////////////////////////////*/

  /** Record the round's house call on Mantle (fire-and-forget — the engine never
   *  blocks on RPC, and a chain failure never touches a tick). When the tx lands,
   *  the round is re-broadcast with its chainTx so the live wire can link it. */
  private maybeEmitOnchain(round: LiveRound): void {
    if (!this.chainKey) return;
    const last = this.lastChainEmit.get(round.market) ?? 0;
    if (Date.now() - last < this.chainEmitIntervalMs) return;
    const ledger = this.resolveLedger();
    if (!ledger) return;
    this.lastChainEmit.set(round.market, Date.now());

    const marketId = keccak256(toBytes(round.market));
    const signals: OnchainSignal[] = round.predictions.map((p) => ({
      agentId: toAgentId(p.agentId),
      marketId,
      isLong: p.direction !== 'SHORT',
      probabilityPpm: toPpm(p.probability)
    }));

    emitConsensusOnchain(ledger, marketId, signals, this.chainKey)
      .then((res) => {
        round.chainTx = res.txHash;
        const cur = this.current.get(round.market);
        if (cur && cur.id === round.id) {
          this.events$.next({
            type: 'round_open',
            market: round.market,
            round,
            reputation: this.reputationFor(round.market)
          });
        }
        this.persist();
      })
      .catch(() => {
        // allow a retry at the next throttle window rather than burning it
        this.lastChainEmit.set(round.market, 0);
      });
  }

  private resolveLedger(): `0x${string}` | null {
    if (this.ledgerAddr !== undefined) return this.ledgerAddr;
    try {
      if (process.env.SIBYL_LEDGER_ADDRESS) {
        this.ledgerAddr = getAddress(process.env.SIBYL_LEDGER_ADDRESS);
        return this.ledgerAddr;
      }
      const p = resolve(process.cwd(), '../../deployments/mantle-sepolia.json');
      const d = JSON.parse(readFileSync(p, 'utf8')) as {
        contracts?: { SibylLedger?: { address?: string } };
      };
      const addr = d.contracts?.SibylLedger?.address;
      this.ledgerAddr = addr ? getAddress(addr) : null;
    } catch {
      this.ledgerAddr = null;
    }
    return this.ledgerAddr;
  }

  /*//////////////////////////// data ////////////////////////////*/

  private async snapshot(market: string): Promise<AgentInput> {
    const sym = bybitSymbol(market);
    try {
      const [tick, kline] = await Promise.all([
        this.json(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${sym}`),
        this.json(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${sym}&interval=15&limit=12`)
      ]);
      const t = tick?.result?.list?.[0];
      if (!t) throw new Error('no ticker');
      const price = Number(t.lastPrice);
      const closes: number[] = (kline?.result?.list ?? []).map((c: string[]) => Number(c[4]));
      const momPct = closes.length > 1 && closes[closes.length - 1] > 0 ? (closes[0] - closes[closes.length - 1]) / closes[closes.length - 1] : 0;
      this.lastPrice.set(market, price);
      return {
        symbol: market,
        timestamp: Math.floor(Date.now() / 1000),
        price,
        fundingRate: Number(t.fundingRate ?? 0),
        oiDelta: 0,
        momentum: Math.max(-1, Math.min(1, Math.tanh(momPct * 30))),
        newsSentiment: 0
      };
    } catch {
      // deterministic synthetic random-walk so the arena stays alive offline
      const prev = this.lastPrice.get(market) ?? (market.startsWith('ETH') ? 2500 : 0.64);
      const now = Math.floor(Date.now() / 1000);
      const drift = Math.sin(now / 90 + market.length) * 0.0035;
      const price = Number((prev * (1 + drift)).toFixed(6));
      this.lastPrice.set(market, price);
      return {
        symbol: market,
        timestamp: now,
        price,
        fundingRate: 0.0001 * Math.cos(now / 300),
        oiDelta: Math.sin(now / 240),
        momentum: Math.sin(now / 180),
        newsSentiment: 0
      };
    }
  }

  private async json(url: string): Promise<any> {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`http ${res.status}`);
    return res.json();
  }

  private reputationFor(market: string): LiveReputation[] {
    const repMap = this.rep.get(market) ?? new Map<string, RepState>();
    return [...repMap.entries()]
      .map(([agentId, s]) => ({
        agentId,
        liveBrier: Number((s.brierSum / s.n).toFixed(4)),
        rounds: s.n - PRIOR_N,
        isRogue: agentId.includes('rogue')
      }))
      .sort((a, b) => a.liveBrier - b.liveBrier);
  }

  private seedReputation(): void {
    const replay = readReplayArtifact();
    for (const market of listMarkets()) {
      if (!this.rep.has(market)) this.rep.set(market, new Map());
      const repMap = this.rep.get(market)!;
      const scores = replay ? scoresForMarket(replay, market) : [];
      for (const agent of DEFAULT_AGENTS) {
        if (repMap.has(agent.id)) continue; // persisted state wins
        const prior = scores.find((s) => s.agentId === agent.id)?.brier ?? 0.25;
        repMap.set(agent.id, { brierSum: prior * PRIOR_N, n: PRIOR_N });
      }
    }
  }

  /*//////////////////////////// persistence ////////////////////////////*/

  private load(): void {
    if (!existsSync(PERSIST_PATH)) return;
    try {
      const d = JSON.parse(readFileSync(PERSIST_PATH, 'utf8')) as Persisted;
      this.nextId = d.nextId ?? 1;
      this.history = d.rounds ?? [];
      for (const [market, agents] of Object.entries(d.reputation ?? {})) {
        this.rep.set(market, new Map(Object.entries(agents)));
      }
    } catch {
      // corrupt state file: start fresh rather than crash
    }
  }

  private persist(): void {
    try {
      const reputation: Persisted['reputation'] = {};
      for (const [market, agents] of this.rep.entries()) {
        reputation[market] = Object.fromEntries(agents.entries());
      }
      mkdirSync(dirname(PERSIST_PATH), { recursive: true });
      writeFileSync(
        PERSIST_PATH,
        JSON.stringify({ nextId: this.nextId, rounds: this.history.slice(0, HISTORY_LIMIT), reputation } satisfies Persisted, null, 2)
      );
    } catch {
      // persistence is best-effort
    }
  }
}
