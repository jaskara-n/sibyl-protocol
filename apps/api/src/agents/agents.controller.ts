import { Controller, Get } from '@nestjs/common';
import { readReplayArtifact } from '../lib/artifacts.js';

@Controller('agents')
export class AgentsController {
  @Get()
  list() {
    const replay = readReplayArtifact();
    if (!replay) return [];

    return replay.scores.map((score) => ({
      agentId: score.agentId,
      brier: score.brier,
      reputationWeight: Number((1 - score.brier).toFixed(6))
    }));
  }
}
