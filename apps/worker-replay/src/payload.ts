import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { keccak256, toBytes } from 'viem';
import { brierToPpm, toAgentId, encodeCommitReplayCalldata, type CommitReplayPayload } from '@sibyl/sdk';

type ReplayScore = { agentId: string; marketId: string; brier: number };
type ReplayArtifact = {
  datasetHash: `0x${string}`;
  generatedAt: string;
  scoringVersion: string;
  scoringVersionId: number;
  markets: string[];
  scores: ReplayScore[];
};

// marketId on-chain is bytes32 == keccak256(symbol), matching the contract convention
// (e.g. CommitReplay.s.sol uses keccak256("default_market")).
function toMarketId(symbol: string): `0x${string}` {
  return keccak256(toBytes(symbol));
}

function main() {
  const replayPath = resolve(process.cwd(), '../../data/artifacts/replay-scores.json');
  const outPath = resolve(process.cwd(), '../../data/artifacts/replay-commit-payload.json');
  const replay = JSON.parse(readFileSync(replayPath, 'utf8')) as ReplayArtifact;

  // Group per-(agent, market) scores by market so each market gets its own commit payload.
  const byMarket = new Map<string, ReplayScore[]>();
  for (const score of replay.scores) {
    if (!score.marketId) {
      throw new Error(`replay score for ${score.agentId} is missing marketId`);
    }
    const list = byMarket.get(score.marketId) ?? [];
    list.push(score);
    byMarket.set(score.marketId, list);
  }

  const markets = [...byMarket.entries()].map(([marketSymbol, scores]) => {
    const marketIdHex = toMarketId(marketSymbol);

    const scoreEntries = scores.map((score) => ({
      agentId: score.agentId,
      agentIdHex: toAgentId(score.agentId),
      marketId: score.marketId,
      marketIdHex,
      brier: score.brier,
      brierPpm: brierToPpm(score.brier)
    }));

    // Build the on-chain commit payload via the SDK helper and derive its calldata,
    // proving the per-market payload encodes against the SibylLedger ABI.
    const commitPayload: CommitReplayPayload = {
      datasetHash: replay.datasetHash,
      scoringVersion: replay.scoringVersionId ?? 1,
      marketId: marketIdHex,
      scores: scoreEntries.map((s) => ({ agentIdHex: s.agentIdHex, brierPpm: s.brierPpm }))
    };

    return {
      marketId: marketSymbol,
      marketIdHex,
      scores: scoreEntries,
      calldata: encodeCommitReplayCalldata(commitPayload)
    };
  });

  const payload = {
    datasetHash: replay.datasetHash,
    generatedAt: replay.generatedAt,
    scoringVersion: replay.scoringVersion,
    scoringVersionId: replay.scoringVersionId ?? 1,
    markets
  };

  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log('Replay commit payload written:', outPath);
  console.log(`  ${markets.length} markets: ${markets.map((m) => m.marketId).join(', ')}`);
}

main();
