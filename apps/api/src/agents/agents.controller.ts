import { Controller, Get } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { weightPpm, toPpm, DEFAULT_MAX_AGENT_WEIGHT_PPM } from '@sibyl/shared';
import { readReplayArtifact } from '../lib/artifacts.js';

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
}
