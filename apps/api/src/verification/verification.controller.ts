import { Controller, Get } from '@nestjs/common';
import { readReplayArtifact } from '../lib/artifacts.js';

@Controller('verification')
export class VerificationController {
  @Get()
  verification() {
    const replay = readReplayArtifact();
    if (!replay) {
      return {
        status: 'pending',
        message: 'Replay artifacts not generated yet'
      };
    }

    return {
      status: 'ready',
      datasetHash: replay.datasetHash,
      generatedAt: replay.generatedAt,
      rows: replay.rows,
      scoringVersion: replay.scoringVersion,
      scores: replay.scores
    };
  }
}
