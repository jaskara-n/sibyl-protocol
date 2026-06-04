# SIBYL — full UI build spec for v0 (design-agnostic)

> Hand this to v0 (Vercel AI) to generate the visual/UX layer. It is **deliberately free of
> colors, fonts, and aesthetics** — those are v0's choice. v0 outputs a Next.js + TypeScript +
> Tailwind (+ shadcn/ui) project with **mock data**; the live API + wallet/contract wiring is
> grafted on afterward, screen by screen. Paste it whole, or page-by-page if v0 truncates.

## What I'm building
Sibyl is the **on-chain credit bureau for AI trading agents**. Autonomous AI agents make
market predictions; they earn a verifiable, re-runnable reputation scored on **calibration
(being right, well-measured) — not PnL or luck**. That reputation becomes their on-chain
voting power. Two live products sit on top:
1. **Consensus** — a reputation-weighted signal across many markets (the best-calibrated
   agents steer the call; loud, overconfident agents are mathematically silenced).
2. **Prediction markets + a reputation-steered vault** — anyone can launch/trade binary
   prediction markets; an ERC-4626 vault allocates capital by the reputation-weighted consensus.

It's a web3 app on a testnet. Tone: premium, modern, professional, data-dense but calm.
Pick the visual language, color, type, and motion yourself — make it feel world-class.

## Tech + ground rules for the build
- Next.js App Router, TypeScript, Tailwind, shadcn/ui welcome, Framer Motion for tasteful motion.
- Dark, responsive (mobile → desktop), accessible (labels on icon buttons, status not by color alone).
- Build with **realistic placeholder/mock data** and clean, well-typed component props — do NOT
  implement real web3 calls; use a **"Connect wallet" button placeholder** in the header and a
  generic wrong-network banner. (Real data + wallet/contract wiring get added later.)
- Every data screen needs four states: loading, empty, error, and (for wallet screens)
  disconnected + wrong-network.

## Personas (who the screens serve)
- **Observer / Evaluator** — explores reputation, consensus, markets (read-only).
- **Allocator** — deposits into the vault.
- **Forecaster / Trader** — trades YES/NO on prediction markets, launches markets.
- **Agent builder (developer)** — registers an agent identity, integrates the SDK.

## Global shell (every page)
- **Top navigation bar**: logo + wordmark "Sibyl" with a small tagline chip "credit bureau for
  AI agents"; nav links: **Arena (home), Markets, Forecast, Create, Agents, Decisions, Vault,
  Verify, Build**; a "Register agent →" highlighted button; a **Connect Wallet** button on the right.
- **Wrong-network banner**: when a wallet is connected to the wrong chain, a dismissible sticky
  banner: "You're on the wrong network — switch to Mantle Sepolia" + a "Switch network" button.
- **Animated background** allowed (your choice). Global **footer** with a one-line manifesto +
  links. Live "epoch / round" countdown chip somewhere in the shell.
- **Transaction feedback** pattern (reuse everywhere): idle → submitting → confirming → confirmed
  (with explorer link) / error (with message). Buttons disable + show a spinner while pending.

---

## PAGES

### 1. Arena (Home `/`)
Hybrid landing + live dashboard.
- **Hero**: headline ("The credit bureau for AI trading agents"), subhead (agents scored on
  calibration not luck; reputation = voting power; "don't trust the loudest agent, trust the one
  that's been right"). Live stat chips: network, # agents live, current epoch, # windows scored.
- **Consensus showcase**: a prominent visualization of the current reputation-weighted consensus
  — direction (LONG / SHORT / FLAT), a confidence dial/gauge (0–100%), position size, and number
  of contributing agents.
- **"The mechanism" explainer card**: short narrative — the best-calibrated agent earns X% of the
  vote; an overconfident "rogue" agent (worst calibration) is silenced to ~0%; no human override,
  enforced in code. Small feature chips (e.g. "inverse-Brier weighting", "per-agent cap",
  "FLAT dead-band, no leverage").
- **Agent reputation leaderboard** (top N): rank, agent name, reputation tier badge, calibration
  score, vote-weight %. Row → agent profile.
- **On-chain panel**: ledger contract address (explorer link), dataset hash, scoring version,
  chain-sync status.
- **"Verify it yourself" panel**: one line on deterministic replay + a copyable command block +
  "260 Foundry tests passing" status.
- CTAs into Markets / Forecast / Build.

### 2. Markets (`/markets`)
Trading markets ranked by **conviction** (reputation weight × active agents).
- Responsive grid of market cards: market symbol (e.g. MNT-USD), a conviction bar/score,
  active-agent count, status badge (live / idle), and a "🔥 most active" highlight on the #1 card.
- Sorted by conviction (highest first). Card → market detail.
- Header explains "markets sorted by where the most reputable, active agents are working."

### 3. Market detail (`/markets/[marketId]`)
- **This-market consensus**: direction + confidence + size + contributor count.
- **Per-market leaderboard**: the agents voting in *this* market with their per-market calibration
  + weight (an agent can have different reputation in different markets).
- **Decision history feed**: timestamped consensus decisions for this market, each linking to its
  on-chain transaction.
- Back link to Markets.

### 4. Forecast (`/forecast`)
Binary **prediction markets** list.
- Grid of market cards, each: the **question** (e.g. "Will MNT trade above $1.50 by Sep 1?"),
  a **YES probability** bar (0–100%, with the implied %), YES/NO liquidity reserves, a resolution
  **status badge** (Open / Awaiting resolution / Resolved YES / Resolved NO / Invalid), and the
  resolve date. Card → forecast detail.
- Empty state invites launching one from Create.

### 5. Forecast detail + trade (`/forecast/[marketId]`)
- **Header**: the question, big implied **YES / NO probability**, resolution status + resolve time.
- **Market facts**: YES/NO reserves, resolver address, pool + collateral addresses (explorer links),
  data freshness.
- **Trade panel** (wallet-gated; shows Connect + wrong-network states; shows balances: collateral
  + YES shares + NO shares). Tabs:
  - **Trade**: choose YES or NO, enter an amount, see a **live quote** (shares out), a slippage
    tolerance, Buy button; plus a Sell control.
  - **Sets**: "Mint complete set" (deposit collateral → get equal YES+NO) and "Redeem set"
    (burn equal YES+NO → collateral).
  - **Resolve** (only visible to the market's resolver, and only after the resolve time):
    resolve YES / NO / Invalid; after resolution, a "Redeem winnings" action.
- Not-found state if the market doesn't exist.

### 6. Create market (`/create`)
Permissionless, one transaction. Wallet-gated (Connect + wrong-network states).
- Intro: "Pose a verifiable yes/no question, set a resolution time, optionally seed liquidity.
  You become the market's resolver."
- Form fields: **Question** (textarea, min length), **Resolution date & time** (must be future),
  **Initial liquidity** (optional, in the collateral token), and a read-only derived **market id**
  + **question hash** preview.
- Shows the user's collateral balance; an "already exists" warning (with a link) if the question
  collides with an existing market.
- Submit flow: optional approve → create. Validation messages inline. On success, a result card
  with the new market + a "Go to your market" link.

### 7. Agents (`/agents`)
Reputation registry / leaderboard.
- **Stat cards**: total agents, average calibration score, the top agent, and the rogue agent's
  silenced vote-weight (to dramatize the mechanism).
- **Leaderboard table**: rank, agent name/avatar, reputation **tier badge** (S/A/B/C/D/E), calibration
  score, vote-weight %, and an "identity registered" indicator (on-chain identity). Row → profile.

### 8. Agent profile (`/agents/[id]`)
- **Header**: agent name/avatar, tier, on-chain identity id.
- **Track-record stats**: calibration score, hit rate, # scored windows.
- **Charts**: a **reputation-over-time** line chart, and a **reliability/calibration diagram**
  (predicted probability vs actual outcome — a scatter/curve showing how well-calibrated it is).
- **Per-market breakdown** with **tabs** to filter the stats/charts by market.
- Not-found state.

### 9. Decisions (`/decisions`)
Live consensus **decision feed** (read-only).
- A streaming list, newest first: timestamp, market, direction (LONG/SHORT/FLAT), confidence,
  size, contributor count, and an on-chain tx link when present.
- A subtle "live" indicator (animated), with an accessible live-region announcement.

### 10. Verify (`/verify`)
Transparency / deterministic replay.
- Explainer: the entire track record is re-runnable; recompute the dataset hash and confirm it
  equals what's committed on-chain.
- Panels: local dataset hash vs on-chain hash with a **match ✓** indicator; scoring version;
  # windows scored; ledger link; test-suite status ("260 Foundry tests passing, incl. on-chain/
  off-chain parity").
- Copyable command/code blocks to reproduce the hash.

### 11. Build (`/build`)
Developer onboarding — "Register your agent."
- **Hero CTA**: "Register your agent" → Connect wallet → **mint an on-chain identity** (real
  action; show idle/pending/success with an explorer link, and an "already registered" state).
- **Steps**: 1) register identity, 2) implement a `predict()` strategy with the SDK, 3) submit
  scored predictions and climb the leaderboard. Each step with a short blurb + code snippet.
- **Strategy template cards** (e.g. momentum, on-chain OI, funding, news) as starting points.
- Network + live-agent-count stats.

### 12. Vault (`/vault`)
ERC-4626 **reputation-steered vault**. Wallet-gated (Connect + wrong-network states).
- **NAV panel**: total assets, cash, positions value, share price.
- **Positions table**: per market — direction, size, current value (handles empty).
- **Deposit / Withdraw form**: a mode toggle, amount input, **live preview** (shares for a deposit,
  assets for a withdraw), balances (collateral + vault shares), approve → deposit / redeem flow
  with tx states.
- **Explainer**: deposits are allocated across spot + prediction markets by the reputation-weighted
  consensus through a single routing venue; performance fee noted; no leverage.

---

## Reusable components to design
Stat chip/pill, metric card, data table/leaderboard row, tier badge, status badge, consensus
gauge/dial, probability bar, conviction bar, line chart, calibration scatter, tabbed panel,
trade/deposit form with amount input + live preview + slippage, connect-wallet button, wrong-network
banner, transaction status (inline + toast), empty/loading/error states, copyable code block,
explorer-link row, countdown clock, animated "live" dot.

## Deliverable
A complete, multi-route Next.js + TypeScript + Tailwind app implementing all 12 screens above with
mock data and clean component props, fully responsive and accessible. Make it look world-class —
the visual direction is yours.
