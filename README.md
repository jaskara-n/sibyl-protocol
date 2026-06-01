# Sibyl Protocol

**On-chain proof-of-edge for AI trading agents.** Multiple agents emit probabilistic signals, earn a verifiable reputation from a re-runnable historical backtest (scored on calibration, not luck), and a reputation-weighted consensus decides a bounded trade on Mantle.

> Don't trust the loudest agent. Trust the one with a track record you can verify.

## Monorepo

| Path | What |
|---|---|
| `packages/contracts` | Solidity (Foundry) — `SibylLedger` + interface + pure consensus library |
| `packages/shared` | Shared types + the canonical consensus (mirrors the contract exactly) |
| `packages/sdk` | viem adapters: `SibylLedger`, ERC-8004 registries, event watcher |
| `packages/agents` | TypeScript signal agents (4 base + 1 rogue exhibit) |
| `apps/api` | NestJS read API |
| `apps/web` | Next.js dashboard |
| `apps/worker-replay` | replay + calibration scoring + commit pipeline |
| `apps/worker-executor` | consensus → execution venue (paper default) |
| `data/` | frozen dataset + reproducible generator |

## Quickstart

```bash
pnpm install
pnpm demo:seed      # replay -> commit payload -> executor (writes data/artifacts)
pnpm dev            # API on :4000, web on :3000
```

## Consensus — one canonical algorithm, two implementations

All consensus math is integer **parts-per-million** (`1_000_000 == 1.0`):

- weight `= (1e6 - min(brier,1e6)) + 1`, capped per agent (`maxAgentWeightPpm`, default 900k — non-binding for realistic Briers, clamps a near-perfect/gaming agent)
- `confidence = weightedLong*1e6 / totalWeight` (floor division)
- direction: `>505000` LONG, `<495000` SHORT, else **FLAT** (dead-band); size `= (edge+125)/250` bps, capped 2000, 0 when FLAT

`packages/contracts/src/libraries/SibylConsensusLib.sol` and `packages/shared` (`computeConsensusPpm`) implement this identically. **Parity is CI-gated**: both read the same frozen `packages/contracts/test/fixtures/consensus-vectors.json`.

```bash
cd packages/contracts && forge test     # 79 tests incl. fuzz/invariant + parity
pnpm --filter @sibyl/shared test         # TS parity against the same vectors
```

## Replay → chain

```bash
node data/datasets/generate-frozen.mjs   # deterministic 300-window x 5-agent dataset
pnpm replay:run && pnpm replay:payload    # score (Brier) + build commit payload
pnpm replay:commit                        # dry-run simulate commitReplay (default)
COMMIT_REPLAY_DRY_RUN=false pnpm replay:commit   # broadcast (needs PRIVATE_KEY)
```

Required env: `MANTLE_RPC_URL`, `SIBYL_LEDGER_ADDRESS`, `PRIVATE_KEY` (broadcast only). Optional: `SCORING_VERSION`, `EXECUTION_VENUE` (`paper` | `byreal`), `BYREAL_ENDPOINT`.

## Contract — `SibylLedger`

`is ISibylLedger, Ownable2Step, Pausable`. Owner-gated writes, public view consensus.

- `registerAgent` · `deactivateAgent`/`reactivateAgent` · `setMaxAgentWeightPpm`
- `commitReplay(datasetHash, scoringVersion, AgentScore[])` — idempotent by (hash, version); auto-registers; preserves manual deactivation
- `computeConsensus(Signal[])` view · `emitConsensus(...)` (owner) · `requestValidation(...)`
- full getter surface incl. paginated reads + `getAgentScoreAt(epoch)`

Custom errors throughout, full NatSpec, per-agent weight cap, FLAT dead-band, input bounds, `MAX_BATCH` DoS guard, epoch + score history.

Scripts: `script/Deploy.s.sol` (logs address), `script/CommitReplay.s.sol`.

## Ecosystem integration

- **ERC-8004** (Trustless Agents) is live on Mantle at deterministic addresses (Identity `0x8004A169…a432`, Reputation `0x8004BAa1…9b63`); adapters in `packages/sdk/src/erc8004.ts`.
- **Execution is spot DEX** on Mantle (Byreal/RealClaw — Merchant Moe / Agni / Fluxion); derivatives are off-chain via Bybit's API and out of the core loop. `ByrealSpotVenue` is wired behind `IExecutionVenue` pending the Byreal Skills CLI spec.

## Endpoints

`GET /health` · `/agents` · `/consensus/latest` · `/trades` · `/verification` · `/verification/commit-payload` · `/verification/commit-calldata` · `/chain/status`
