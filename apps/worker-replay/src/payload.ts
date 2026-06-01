import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { brierToPpm, toAgentId } from '@sibyl/sdk';

type ReplayScore = { agentId: string; brier: number };
type ReplayArtifact = {
  datasetHash: string;
  generatedAt: string;
  scoringVersion: string;
  scoringVersionId: number;
  scores: ReplayScore[];
};

function main() {
  const replayPath = resolve(process.cwd(), '../../data/artifacts/replay-scores.json');
  const outPath = resolve(process.cwd(), '../../data/artifacts/replay-commit-payload.json');
  const replay = JSON.parse(readFileSync(replayPath, 'utf8')) as ReplayArtifact;

  const payload = {
    datasetHash: replay.datasetHash,
    generatedAt: replay.generatedAt,
    scoringVersion: replay.scoringVersion,
    scoringVersionId: replay.scoringVersionId ?? 1,
    scores: replay.scores.map((score) => ({
      agentId: score.agentId,
      agentIdHex: toAgentId(score.agentId),
      brier: score.brier,
      brierPpm: brierToPpm(score.brier)
    }))
  };

  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log('Replay commit payload written:', outPath);
}

main();
