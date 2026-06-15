# Sibyl Protocol

**On-chain proof-of-edge for AI trading agents.** Multiple agents emit probabilistic signals, earn a verifiable reputation from a re-runnable historical backtest (scored on calibration, not luck), and a reputation-weighted consensus decides a bounded trade on Mantle.

> Don't trust the loudest agent. Trust the one with a track record you can verify.

**🔮 Live app:** [sibylprotocol.vercel.app](https://sibylprotocol.vercel.app) · **Track:** AI Trading & Strategy · **Chain:** Mantle Sepolia (5003)

## Live deployment — Mantle Sepolia testnet (chainId 5003)

> Testnet only — no mainnet, no real funds. **All contracts below are source-verified on [Sourcify](https://sourcify.dev) (10/10, `exact_match`).**

### Contracts

| Contract | Address |
|---|---|
| `SibylLedger` (reputation + consensus) | [`0x1C4cCc2c917EDF45aD1C3C9675cF130b47Db8c11`](https://explorer.sepolia.mantle.xyz/address/0x1C4cCc2c917EDF45aD1C3C9675cF130b47Db8c11) |
| `SibylVault` (ERC-4626) | [`0x62c494cca2df8fF04960d2A73CB723D862554916`](https://explorer.sepolia.mantle.xyz/address/0x62c494cca2df8fF04960d2A73CB723D862554916) |
| `PredictionFactory` (create + seed markets) | [`0xfCf5180c83E1A753eaFf489508154430354A7682`](https://explorer.sepolia.mantle.xyz/address/0xfCf5180c83E1A753eaFf489508154430354A7682) |
| `SibylPredictionMarket` (Gnosis CTF) | [`0x23960EE69b04e9DC87AE3D5E1e7799c6028edc16`](https://explorer.sepolia.mantle.xyz/address/0x23960EE69b04e9DC87AE3D5E1e7799c6028edc16) |
| `MetaVenue` (execution router) | [`0x787E51491F5cC4b2B99BC3F931a9f2199F072E1E`](https://explorer.sepolia.mantle.xyz/address/0x787E51491F5cC4b2B99BC3F931a9f2199F072E1E) |
| `sUSD` (testnet base asset) | [`0x6f5BdBe611aE3c84153BD9d2216ce076C2FBba18`](https://explorer.sepolia.mantle.xyz/address/0x6f5BdBe611aE3c84153BD9d2216ce076C2FBba18) |
| ERC-8004 identity registry | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://explorer.sepolia.mantle.xyz/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) — agents #98–102 |

### On-chain record

| | |
|---|---|
| Markets | `MNT-USD` · `ETH-USD` · `BTC-USD` — independent per-(agent,market) reputation |
| committed datasetHash | `0xc433aaa9dd68b65da3b2c659dd3881f9c2cbeb82781c801ae58c350be628b796` |
| `commitReplay` txs | MNT [`0x6f6a4447…`](https://explorer.sepolia.mantle.xyz/tx/0x6f6a4447de203bd5522754cf5209a762f42cbdae55536b43fad7b339870e7294) · ETH [`0x587f394d…`](https://explorer.sepolia.mantle.xyz/tx/0x587f394d8628dbed584727d927a6aa28a4eda5ee915adce8c38ffcc9189f15cf) |
| `ConsensusReached` | MNT [`0xc8165df8…`](https://explorer.sepolia.mantle.xyz/tx/0xc8165df8445b6fa56eb3487d09096fb428acab4d61b9b04dc35738ea1fc93c25) · ETH [`0x8bd37993…`](https://explorer.sepolia.mantle.xyz/tx/0x8bd3799350a5157405d0b9e4434d83e1bc32aa92df88c7af6314a890e187353b) |
| ERC-8004 identity registry | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://explorer.sepolia.mantle.xyz/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) — agents #98–102 |

**Verify it yourself:** `node data/datasets/generate-frozen.mjs` → SHA-256 the CSV → it equals the on-chain committed `datasetHash`.

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

## Economic model — a credit bureau for AI agents

Sibyl doesn't allocate capital *to* agents; it *certifies* them, the way Experian certifies a borrower for lenders.

- **What agents earn — two things.** (1) A **real payout**: the `SibylVault` charges a **2% high-water-mark performance fee**, split between a protocol recipient and the agent `RewardDistributor`; each epoch agents `claim` their pro-rata share, weighted by allocation — so they're paid when the consensus they shaped makes money. (2) A **portable on-chain reputation** (ERC-8004 identity + calibration score) — their public `/agents` profile is their **credit report**, carried anywhere to raise capital. A refundable `AgentBond` keeps them honest (slashable only for *proven fraud*, never for being wrong).
- **How Sibyl earns.** The scores stay a **free public good** (the moat). Revenue is the **protocol share** of the vault's 2% high-water-mark performance fee — only on real NAV gains, the way a fund earns carry. We earn only when users *and* agents do.
- **Where capital flows.** Capital follows the blended **consensus** (the vault), never an individual agent — so no single agent can be bribed or front-run into steering funds. Size scales with consensus strength; **never leverage**.

> Trading is the first vertical because calibration is cleanly measurable there. The primitive — identity → calibration score → reputation-weighted aggregation — is reusable by agent marketplaces, DeFi vaults, DAOs, and prediction-market resolvers. That broader "reputation oracle other protocols query" is the **roadmap the primitive enables**, not shipped infra.

## Ecosystem integration

- **ERC-8004** (Trustless Agents) is live on Mantle; adapters in `packages/sdk/src/erc8004.ts`. **All 5 agents hold ERC-8004 identity NFTs on Mantle Sepolia (ids 98–102)** — each `agentURI` links the NFT to its `SibylLedger` id; see `deployments/agent-identities.json`. (Reputation stays canonical in `SibylLedger`: the registry blocks self-feedback, so we don't self-rate.)
- **Execution is spot DEX** on Mantle (Byreal/RealClaw — Merchant Moe / Agni / Fluxion); derivatives are off-chain via Bybit's API and out of the core loop. `ByrealSpotVenue` is wired behind `IExecutionVenue` pending the Byreal Skills CLI spec.

## Endpoints

`GET /health` · `/agents` · `/consensus/latest` · `/trades` · `/verification` · `/verification/commit-payload` · `/verification/commit-calldata` · `/chain/status`
