import { Controller, Get, Param } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { weightPpm, toPpm, DEFAULT_MAX_AGENT_WEIGHT_PPM } from '@sibyl/shared';
import { readReplayArtifact, readFrozenSamples } from '../lib/artifacts.js';

/** Per-agent analytics derived from the frozen replay dataset. */
type AgentProfile = {
  agentId: string;
  erc8004AgentId?: string | null;
  brier: number;
  count: number;
  hitRate: number;
  isRogue: boolean;
  reputationCurve: { window: number; cumBrier: number }[];
  reliability: { bucket: number; predicted: number; actual: number; n: number }[];
  recentSignals: { ts: number; prob: number; outcome: number }[];
};

type AgentIdentity = {
  name: string;
  ledgerAgentId?: string;
  agentURI?: string;
  erc8004AgentId?: string;
  txHash?: string;
};

/// ERC-8004 identity records (single source of truth: deployments/agent-identities.json).
/// Keyed by agent name so /agents can surface each agent's on-chain ERC-8004 token id.
function readAgentIdentities(): Map<string, string> {
  const path = resolve(process.cwd(), '../../deployments/agent-identities.json');
  if (!existsSync(path)) return new Map();
  try {
    const records = JSON.parse(readFileSync(path, 'utf8')) as AgentIdentity[];
    return new Map(
      records
        .filter((r) => r.name && r.erc8004AgentId !== undefined)
        .map((r) => [r.name, String(r.erc8004AgentId)])
    );
  } catch {
    return new Map();
  }
}

@Controller('agents')
export class AgentsController {
  @Get()
  list() {
    const replay = readReplayArtifact();
    if (!replay) return [];

    const cap = BigInt(DEFAULT_MAX_AGENT_WEIGHT_PPM);
    const identities = readAgentIdentities();

    // Canonical capped weight per agent (mirrors the on-chain weighting), then normalized
    // into a share so the leaderboard shows the actual influence each agent has on consensus.
    const enriched = replay.scores.map((score) => {
      const brierPpm = toPpm(score.brier);
      const raw = weightPpm(brierPpm);
      const capped = raw > cap ? cap : raw;
      return {
        agentId: score.agentId,
        brier: score.brier,
        brierPpm,
        cappedWeight: capped,
        isRogue: score.agentId.includes('rogue'),
        erc8004AgentId: identities.get(score.agentId) ?? null
      };
    });

    const totalWeight = enriched.reduce((sum, a) => sum + a.cappedWeight, 0n);

    return enriched
      .map((a) => ({
        agentId: a.agentId,
        erc8004AgentId: a.erc8004AgentId,
        brier: a.brier,
        brierPpm: a.brierPpm,
        reputationWeight: Number((1 - a.brier).toFixed(6)),
        weightShare: totalWeight === 0n ? 0 : Number((Number(a.cappedWeight) / Number(totalWeight)).toFixed(6)),
        isRogue: a.isRogue
      }))
      .sort((x, y) => y.weightShare - x.weightShare);
  }

  @Get(':id/profile')
  profile(@Param('id') id: string): AgentProfile {
    const identities = readAgentIdentities();
    const erc8004AgentId = identities.get(id) ?? null;
    const isRogue = id.includes('rogue');

    // Chronological per-agent samples from the frozen replay dataset.
    const samples = readFrozenSamples()
      .filter((s) => s.agentId === id)
      .sort((a, b) => a.timestamp - b.timestamp);

    const count = samples.length;
    if (count === 0) {
      return {
        agentId: id,
        erc8004AgentId,
        brier: 0,
        count: 0,
        hitRate: 0,
        isRogue,
        reputationCurve: [],
        reliability: Array.from({ length: 10 }, (_, bucket) => ({
          bucket,
          predicted: 0,
          actual: 0,
          n: 0
        })),
        recentSignals: []
      };
    }

    // Brier = mean squared error of probability vs binary outcome.
    const seBrier = samples.map((s) => (s.probability - s.outcome) ** 2);
    const brier = seBrier.reduce((sum, x) => sum + x, 0) / count;

    // Hit rate = share of windows where the thresholded prediction matched the outcome.
    const hits = samples.filter((s) => Math.round(s.probability) === s.outcome).length;
    const hitRate = hits / count;

    // Reputation curve = cumulative Brier after each window, downsampled to ~60 points.
    const fullCurve: { window: number; cumBrier: number }[] = [];
    let running = 0;
    for (let i = 0; i < count; i++) {
      running += seBrier[i];
      fullCurve.push({ window: i + 1, cumBrier: Number((running / (i + 1)).toFixed(6)) });
    }
    const targetPoints = 60;
    const step = Math.max(1, Math.ceil(count / targetPoints));
    const reputationCurve = fullCurve.filter((_, i) => i % step === 0 || i === count - 1);

    // Reliability diagram: 10 equal-width buckets over p in [0, 1).
    const buckets = Array.from({ length: 10 }, () => ({ pSum: 0, oSum: 0, n: 0 }));
    for (const s of samples) {
      let idx = Math.floor(s.probability * 10);
      if (idx > 9) idx = 9;
      if (idx < 0) idx = 0;
      buckets[idx].pSum += s.probability;
      buckets[idx].oSum += s.outcome;
      buckets[idx].n += 1;
    }
    const reliability = buckets.map((b, bucket) => ({
      bucket,
      predicted: b.n === 0 ? 0 : Number((b.pSum / b.n).toFixed(6)),
      actual: b.n === 0 ? 0 : Number((b.oSum / b.n).toFixed(6)),
      n: b.n
    }));

    // Most recent ~20 signals (newest last, matching chronological order).
    const recentSignals = samples.slice(-20).map((s) => ({
      ts: s.timestamp,
      prob: s.probability,
      outcome: s.outcome
    }));

    return {
      agentId: id,
      erc8004AgentId,
      brier: Number(brier.toFixed(6)),
      count,
      hitRate: Number(hitRate.toFixed(6)),
      isRogue,
      reputationCurve,
      reliability,
      recentSignals
    };
  }
}
