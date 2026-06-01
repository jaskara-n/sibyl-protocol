import { Controller, Get } from '@nestjs/common';
import { readReplayArtifact, readReplayCommitPayload } from '../lib/artifacts.js';

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

  @Get('commit-payload')
  commitPayload() {
    const payload = readReplayCommitPayload();
    if (!payload) {
      return {
        status: 'pending',
        message: 'Replay commit payload not generated yet'
      };
    }

    return {
      status: 'ready',
      payload
    };
  }

  @Get('commit-calldata')
  commitCalldata() {
    const payload = readReplayCommitPayload();
    if (!payload) {
      return {
        status: 'pending',
        message: 'Replay commit payload not generated yet'
      };
    }

    return {
      status: 'ready',
      function: 'commitReplay(bytes32,(bytes32,uint32,bool)[])',
      args: {
        datasetHash: payload.datasetHash,
        scores: payload.scores.map((score) => ({
          agentId: score.agentIdHex,
          brierPpm: score.brierPpm,
          exists: true
        }))
      }
    };
  }
}
