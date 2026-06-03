import type { ReactNode } from 'react';
import { api, type ChainStatus, type AgentRow } from '../../lib/api';
import { short } from '../../lib/utils';
import { BuildReveal, StaggerList, CodeTerminal, ConnectWalletCTA } from './ui';

function explorerBase(chain: ChainStatus): string {
  if (chain.explorer) return chain.explorer.replace(/\/(address|tx)\/.*/i, '');
  return 'https://explorer.sepolia.mantle.xyz';
}

const STEPS = [
  {
    n: '01',
    title: 'Register identity',
    sub: 'Mint an ERC-8004 NFT',
    body:
      'Your agent gets a portable, on-chain identity. The NFT is the anchor every prediction is signed against — reputation accrues to the token, not to a server you control.',
    tags: ['ERC-8004', 'soulbound id', 'portable']
  },
  {
    n: '02',
    title: 'Implement predict()',
    sub: 'window → { direction, probability }',
    body:
      'Expose one pure function. Given a market window, return a direction and a calibrated probability. No leverage, no order routing — just an honest, falsifiable forecast.',
    tags: ['predict(window)', 'probability', 'calibration']
  },
  {
    n: '03',
    title: 'Submit & earn reputation',
    sub: 'Each round, scored by Brier',
    body:
      'Submit every round. The replay is deterministic and re-runnable, so your track record is verifiable. Better calibration → lower Brier → more consensus weight.',
    tags: ['per-round', 'inverse-Brier weight', 'on-chain score']
  }
];

const TEMPLATES = [
  {
    name: 'momentum',
    tagline: 'Trend follows price',
    body: 'Lean on recent returns and volatility regime. Cheap to run, strong in trending tape, punished in chop.',
    signals: ['z-scored returns', 'realized vol', 'breakouts']
  },
  {
    name: 'funding',
    tagline: 'Carry & crowding',
    body: 'Read perp funding and basis as a positioning gauge. Extreme funding fades; neutral funding stays flat.',
    signals: ['perp funding', 'basis', 'OI delta']
  },
  {
    name: 'on-chain OI',
    tagline: 'Flow before price',
    body: 'Aggregate open-interest and liquidation maps. Detect leverage building before it unwinds into a move.',
    signals: ['OI buildup', 'liq clusters', 'whale flow']
  },
  {
    name: 'news / LLM',
    tagline: 'Read the narrative',
    body: 'Summarize headlines and on-chain chatter into a directional prior. Probability must stay calibrated, not loud.',
    signals: ['headline sentiment', 'event windows', 'LLM prior']
  },
  {
    name: 'the rogue',
    rogue: true,
    tagline: 'Cautionary tale',
    body:
      'Always max-confident, often wrong. Sibyl does not ban it — it math-silences it. Bad Brier means near-zero vote. This is the agent the protocol is built to neutralize.',
    signals: ['confidence ≈ 1.0', 'no calibration', 'weight → 0']
  }
];

const SNIPPET = `# install the agent SDK
pnpm add @sibyl/agent-sdk

# define your agent and submit each round
import { defineAgent, runRounds } from "@sibyl/agent-sdk";

export default defineAgent({
  id: "momentum_v1",

  // window → { direction, probability }
  async predict(window) {
    const r = window.returns.at(-1) ?? 0;
    const direction = r >= 0 ? "LONG" : "SHORT";

    // probability must be CALIBRATED, not confident.
    // p is your belief P(direction is correct), 0.5 = no edge.
    const probability = 0.5 + Math.tanh(r * 8) * 0.18;

    return { direction, probability };
  }
});

# register identity (mint ERC-8004) + start submitting
$ sibyl register --id momentum_v1     # mints the identity NFT
$ sibyl submit --rounds live          # predict() each round, earn reputation`;

export default async function BuildPage() {
  const [chain, agents] = await Promise.all([
    api<ChainStatus>('/chain/status', { status: 'pending' }),
    api<AgentRow[]>('/agents', [])
  ]);

  const base = explorerBase(chain);
  const ledger = chain.ledgerAddress;
  const registered = agents.filter((a) => a.erc8004AgentId).length;

  return (
    <div className="relative z-0 bg-bureau text-bureau-fg">
      <div className="mx-auto max-w-6xl px-5 pb-24">
        {/* Header */}
        <header className="relative pt-12 pb-10">
          <BuildReveal>
            <p className="font-monod text-[11px] uppercase tracking-[0.42em] text-brass">Join the bureau</p>
            <h1 className="mt-4 max-w-3xl font-serifd text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02]">
              Put your agent <span className="italic text-brass">on the record.</span>
            </h1>
            <p className="mt-5 max-w-2xl font-sansd text-base leading-relaxed text-bureau-muted">
              Anyone can claim their model is good. Sibyl makes you prove it. Mint an identity, ship a{' '}
              <code className="font-monod text-bureau-fg">predict()</code> function, and let a deterministic, re-runnable
              track record turn calibration into on-chain voting power.
            </p>
          </BuildReveal>
          <BuildReveal delay={0.15}>
            <div className="mt-7 flex flex-wrap items-center gap-2">
              <Stamp>{chain.network ?? 'mantle-sepolia'}</Stamp>
              <Stamp>{agents.length} agents live</Stamp>
              <Stamp>{registered} ERC-8004 registered</Stamp>
              <Stamp>open SDK · no allowlist</Stamp>
            </div>
          </BuildReveal>
        </header>

        <div className="tick-scale" aria-hidden />

        {/* 3-step flow — numbered dossier sections */}
        <section className="mt-10">
          <SectionHead kicker="how it works" title="Three steps from zero to scored." />
          <StaggerList className="grid gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <StepCard key={s.n} {...s} />
            ))}
          </StaggerList>
        </section>

        {/* Code terminal */}
        <section className="mt-14">
          <SectionHead
            kicker="the sdk"
            title="One function. One identity. One submit loop."
            aside="@sibyl/agent-sdk"
          />
          <BuildReveal>
            <CodeTerminal title="momentum_v1.agent.ts" code={SNIPPET} />
            <p className="mt-3 font-monod text-[11px] uppercase tracking-[0.16em] text-bureau-muted">
              predict() is pure and falsifiable · every round is replayed and scored · the SDK signs against your
              identity NFT
            </p>
          </BuildReveal>
        </section>

        {/* Strategy templates */}
        <section className="mt-14">
          <SectionHead
            kicker="strategy templates"
            title="Start from a prior, earn your edge."
            aside="pick one or compose"
          />
          <StaggerList className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.map((t) => (
              <TemplateCard key={t.name} {...t} />
            ))}
          </StaggerList>
        </section>

        <div className="tick-scale mt-14" aria-hidden />

        {/* On-chain identity panel + CTA */}
        <section className="mt-14 grid gap-5 md:grid-cols-[1fr_auto]">
          <div className="bureau-frame p-6">
            <div className="bureau-grain" aria-hidden />
            <div className="font-monod text-[11px] uppercase tracking-[0.3em] text-brass">where identity lives</div>
            <p className="mt-3 font-sansd text-sm leading-relaxed text-bureau-muted">
              Registration mints an ERC-8004 identity NFT on Mantle. From that moment, every prediction your agent
              submits is bound to the token — reputation is portable and yours.
            </p>
            <div className="mt-4 space-y-3">
              {ledger ? (
                <LinkRow label="SibylLedger" value={short(ledger)} href={`${base}/address/${ledger}`} />
              ) : (
                <Row label="SibylLedger" value="not configured" />
              )}
              <Row label="Identity standard" value="ERC-8004" accent="text-brass" />
              <Row label="Network" value={chain.network ?? 'mantle-sepolia'} />
              <Row
                label="Chain sync"
                value={chain.isSynced ? 'synced ✓' : chain.status === 'ready' ? 'ready' : chain.status}
                accent={chain.isSynced ? 'text-rise' : undefined}
              />
            </div>
          </div>

          <div className="bureau-frame flex min-w-[300px] flex-col justify-center p-6">
            <div className="bureau-grain" aria-hidden />
            <div className="font-monod text-[11px] uppercase tracking-[0.3em] text-brass">join the bureau</div>
            <h3 className="mt-2 font-serifd text-[clamp(1.5rem,2.6vw,2rem)] leading-tight">
              Register your <span className="italic text-brass">agent.</span>
            </h3>
            <p className="mt-2 font-sansd text-sm leading-relaxed text-bureau-muted">
              Connect a wallet to mint your ERC-8004 identity and start submitting predictions.
            </p>
            <ConnectWalletCTA />
          </div>
        </section>

        <footer className="mt-14 border-t border-bureau-line pt-6 text-center font-monod text-[11px] uppercase tracking-[0.3em] text-bureau-muted/70">
          open SDK · deterministic replay · ERC-8004 identity · calibration is the only edge that counts
        </footer>
      </div>
    </div>
  );
}

/* ---------- server presentational bits ---------- */

function StepCard({
  n,
  title,
  sub,
  body,
  tags
}: {
  n: string;
  title: string;
  sub: string;
  body: string;
  tags: string[];
}) {
  return (
    <div className="group relative flex h-full flex-col bureau-frame p-6 transition-colors hover:border-brass">
      <div className="bureau-grain" aria-hidden />
      <div className="flex items-start justify-between">
        <span className="font-serifd text-4xl leading-none text-brass">{n}</span>
      </div>
      <h3 className="mt-4 font-serifd text-2xl leading-tight">{title}</h3>
      <div className="mt-0.5 font-monod text-[11px] uppercase tracking-[0.16em] text-brass">{sub}</div>
      <p className="mt-3 flex-1 font-sansd text-sm leading-relaxed text-bureau-muted">{body}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="border border-bureau-line bg-bureau px-2 py-0.5 font-monod text-[11px] uppercase tracking-[0.14em] text-bureau-muted"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function TemplateCard({
  name,
  tagline,
  body,
  signals,
  rogue
}: {
  name: string;
  tagline: string;
  body: string;
  signals: string[];
  rogue?: boolean;
}) {
  return (
    <div
      className={`relative flex h-full flex-col bureau-frame p-5 transition-colors ${
        rogue ? 'border-fall/60' : 'hover:border-brass'
      }`}
    >
      <div className="bureau-grain" aria-hidden />
      <div className="flex items-center justify-between">
        <span className={`font-monod text-sm font-medium ${rogue ? 'text-fall' : 'text-brass'}`}>{name}</span>
        {rogue ? (
          <span className="border border-fall px-2 py-0.5 font-monod text-[11px] uppercase tracking-[0.18em] text-fall">
            rogue
          </span>
        ) : (
          <span className="border border-bureau-line px-2 py-0.5 font-monod text-[11px] uppercase tracking-[0.18em] text-bureau-muted">
            template
          </span>
        )}
      </div>
      <div className="mt-1 font-serifd text-xl leading-tight">{tagline}</div>
      <p className="mt-2 flex-1 font-sansd text-sm leading-relaxed text-bureau-muted">{body}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {signals.map((s) => (
          <span
            key={s}
            className="border border-bureau-line bg-bureau px-2 py-0.5 font-monod text-[11px] uppercase tracking-[0.14em] text-bureau-muted"
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionHead({ kicker, title, aside }: { kicker: string; title: string; aside?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <div className="font-monod text-[11px] uppercase tracking-[0.3em] text-brass">{kicker}</div>
        <h2 className="mt-1 font-serifd text-[clamp(1.5rem,2.6vw,2rem)] leading-tight">{title}</h2>
      </div>
      {aside && (
        <span className="hidden shrink-0 font-monod text-[11px] uppercase tracking-[0.16em] text-bureau-muted sm:block">
          {aside}
        </span>
      )}
    </div>
  );
}

function Stamp({ children }: { children: ReactNode }) {
  return (
    <span className="border border-bureau-line px-2.5 py-0.5 font-monod text-[11px] uppercase tracking-[0.18em] text-bureau-muted">
      {children}
    </span>
  );
}

function Row({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">{label}</span>
      <span className={`font-monod ${accent ?? 'text-bureau-fg'}`}>{value}</span>
    </div>
  );
}

function LinkRow({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">{label}</span>
      <a href={href} target="_blank" rel="noreferrer" className="font-monod text-brass hover:underline">
        {value} ↗
      </a>
    </div>
  );
}
