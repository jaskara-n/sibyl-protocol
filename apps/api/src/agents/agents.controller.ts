import { Controller, Get } from '@nestjs/common';
import { weightPpm, toPpm, DEFAULT_MAX_AGENT_WEIGHT_PPM } from '@sibyl/shared';
import { readReplayArtifact } from '../lib/artifacts.js';

@Controller('agents')
export class AgentsController {
  @Get()
  list() {
    const replay = readReplayArtifact();
    if (!replay) return [];

    const cap = BigInt(DEFAULT_MAX_AGENT_WEIGHT_PPM);

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
        isRogue: score.agentId.includes('rogue')
      };
    });

    const totalWeight = enriched.reduce((sum, a) => sum + a.cappedWeight, 0n);

    return enriched
      .map((a) => ({
        agentId: a.agentId,
        brier: a.brier,
        brierPpm: a.brierPpm,
        reputationWeight: Number((1 - a.brier).toFixed(6)),
        weightShare: totalWeight === 0n ? 0 : Number((Number(a.cappedWeight) / Number(totalWeight)).toFixed(6)),
        isRogue: a.isRogue
      }))
      .sort((x, y) => y.weightShare - x.weightShare);
  }
}
