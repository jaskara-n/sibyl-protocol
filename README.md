# Sibyl Protocol

Sibyl is an on-chain reputation-weighted AI trading signal protocol on Mantle.

## Monorepo

- `apps/web` - Next.js dashboard
- `apps/api` - NestJS backend API
- `apps/worker-replay` - replay + calibration scoring worker
- `apps/worker-executor` - consensus listener + execution worker
- `packages/contracts` - Solidity contracts (Foundry)
- `packages/agents` - TypeScript signal agents
- `packages/shared` - shared schemas and consensus logic
- `packages/sdk` - chain and registry adapters
- `data/` - frozen datasets and replay/trade artifacts

## Quickstart

1. Install dependencies

```bash
pnpm install
```

2. Seed demo artifacts in one shot

```bash
pnpm demo:seed
```

3. Start API + web

```bash
pnpm dev
```

- API: `http://localhost:4000`
- Web: `http://localhost:3000`

## Useful Endpoints

- `GET /health`
- `GET /agents`
- `GET /consensus/latest`
- `GET /trades`
- `GET /verification`
- `GET /verification/commit-payload`
- `GET /verification/commit-calldata`

## Contract

Core contract: `packages/contracts/src/SibylLedger.sol`

Foundry scripts:
- `script/Deploy.s.sol`
- `script/CommitReplay.s.sol`

Example replay commit run:

```bash
cd packages/contracts
forge script script/CommitReplay.s.sol:CommitReplayScript \
  --rpc-url "$MANTLE_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast
```

Required env:
- `SIBYL_LEDGER_ADDRESS`
- `REPLAY_DATASET_HASH`
