# Deploying Sibyl (free tier)

Two services, both free:

- **Frontend** (`apps/web`, Next.js 15) -> **Vercel**
- **API** (`apps/api`, NestJS 11 + SSE live wire) -> **Render**

The API reads all contract addresses from `deployments/mantle-sepolia.json`, so a
read-only deployment needs almost no configuration. GitHub Pages will NOT work for
either service (static-only; cannot run a Node server, SSE, or SSR).

---

## 1. API -> Render

The repo ships a `render.yaml` blueprint.

1. Render Dashboard -> **New -> Blueprint** -> select this repo. It picks up
   `render.yaml` and creates the `sibyl-api` web service (free plan).
2. Confirm the env vars (already in the blueprint):
   - `MANTLE_RPC_URL = https://rpc.sepolia.mantle.xyz`
   - `ROUNDS_ENABLED = true`, `ROUNDS_CHAIN_EMIT = 0`, `COMMIT_REPLAY_DRY_RUN = true`
   - `NODE_VERSION = 20`
3. Deploy. Copy the public URL, e.g. `https://sibyl-api.onrender.com`.

Why it works: `rootDir: apps/api` runs the server with `cwd = apps/api`, which is
required because addresses resolve as `../../deployments/mantle-sepolia.json`.

**Free-tier note:** the service sleeps after ~15 min idle (30–60s cold start, and
the live wire pauses while asleep). Keep it warm with a free
[UptimeRobot](https://uptimerobot.com) monitor pinging the URL every 5 min.

### Manual setup (instead of the blueprint)
- Root Directory: `apps/api`
- Build: `corepack enable && pnpm install --prod=false && pnpm --filter "@sibyl/api..." build`
- Start: `node dist/apps/api/src/main.js`

---

## 2. Frontend -> Vercel

1. Vercel -> **Add New -> Project** -> import this repo.
2. **Root Directory: `apps/web`** (important — it's a pnpm monorepo).
   Framework auto-detects as Next.js; `apps/web/vercel.json` pins the build.
3. Add env var:
   - `NEXT_PUBLIC_API_BASE_URL = https://sibyl-api.onrender.com` (your Render URL)
4. Deploy -> you get `https://<project>.vercel.app`.

(Optional) After Vercel is live, set `CORS_ORIGIN` on the Render service to your
Vercel URL to lock the API's CORS down.

---

## 3. Read-only vs live-emit

- **Read-only (default, recommended for a public host):** no `PRIVATE_KEY`. The site
  reads the reputation, consensus, and vault NAV already committed on-chain. Zero
  secrets on the host.
- **Live-emit:** the deployed server keeps writing new consensus rounds on-chain.
  Set `ROUNDS_CHAIN_EMIT=1` and add `PRIVATE_KEY` (the **ledger-owner** key) as a
  **secret** env var. Use a throwaway testnet wallet with a little Sepolia MNT.
  Safer alternative: leave the host read-only and run live-emit from your laptop
  during the demo (`pnpm emit:onchain`).

---

## 4. Hackathon checklist (20-Project Deployment Award)

- [x] Smart contract deployed on Mantle (Sepolia) — see `deployments/mantle-sepolia.json`
- [ ] Contract **verified** on Mantle Explorer (`explorer.sepolia.mantle.xyz`)
- [x] At least one AI-powered function callable on-chain (consensus / replay commit)
- [ ] Frontend publicly accessible (this Vercel deploy)
- [ ] Deployment address in the DoraHacks submission
- [ ] Demo video (>= 2 min) walking the core flow
- [x] Open-source repo with README (setup, architecture, deployed address)
