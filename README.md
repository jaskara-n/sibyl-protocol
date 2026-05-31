# Sibyl Protocol

Sibyl is an on-chain reputation-weighted AI trading signal protocol on Mantle.

## Monorepo

- `apps/web` - Next.js dashboard
- `apps/api` - NestJS backend API
- `apps/worker-replay` - replay + calibration scoring worker
- `apps/worker-executor` - consensus listener + execution worker
- `packages/contracts` - Solidity contracts (Foundry)
- `packages/agents` - TypeScript signal agents
- `packages/shared` - shared schemas and scoring logic
- `packages/sdk` - chain and registry adapters

## Getting Started

1. Install pnpm and Node 20+
2. `pnpm install`
3. `pnpm -r build`
