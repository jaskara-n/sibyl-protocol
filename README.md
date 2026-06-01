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

2. Generate replay artifacts

```bash
pnpm replay:run
```

3. Generate a paper trade event

```bash
pnpm executor:run
```

4. Start API + web

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

## Contract

Contract source: `packages/contracts/src/SibylLedger.sol`
