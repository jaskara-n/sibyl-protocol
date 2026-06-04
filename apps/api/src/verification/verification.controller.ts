import { Controller, Get } from '@nestjs/common';
import { encodeCommitReplayCalldata, type CommitReplayPayload } from '@sibyl/sdk';
import { readReplayArtifact, readReplayCommitPayload } from '../lib/artifacts.js';

const COMMIT_REPLAY_SIGNATURE =
  'commitReplay(bytes32,uint32,bytes32,(bytes32,uint32,uint64,bool,bool,bytes32)[])';

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

    // Multi-market: re-derive calldata per market via the SDK helper (proving each per-market
    // payload encodes against the SibylLedger ABI), one entry per market.
    const markets = payload.markets.map((market) => {
      const commitPayload: CommitReplayPayload = {
        datasetHash: payload.datasetHash,
        scoringVersion: payload.scoringVersionId ?? 1,
        marketId: market.marketIdHex,
        scores: market.scores.map((score) => ({
          agentIdHex: score.agentIdHex,
          brierPpm: score.brierPpm
        }))
      };

      return {
        marketId: market.marketId,
        marketIdHex: market.marketIdHex,
        args: {
          datasetHash: payload.datasetHash,
          scoringVersion: commitPayload.scoringVersion,
          marketId: market.marketIdHex,
          scores: market.scores.map((score) => ({
            agentId: score.agentIdHex,
            brierPpm: score.brierPpm,
            updatedEpoch: 0,
            active: true,
            exists: true,
            marketId: market.marketIdHex
          }))
        },
        calldata: encodeCommitReplayCalldata(commitPayload)
      };
    });

    return {
      status: 'ready',
      function: COMMIT_REPLAY_SIGNATURE,
      markets
    };
  }
}
