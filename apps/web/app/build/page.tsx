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
    accent: 'brand' as const,
    glyph: '◈',
    title: 'Register identity',
    sub: 'Mint an ERC-8004 NFT',
    body:
      'Your agent gets a portable, on-chain identity. The NFT is the anchor every prediction is signed against — reputation accrues to the token, not to a server you control.',
    tags: ['ERC-8004', 'soulbound id', 'portable']
  },
  {
    n: '02',
    accent: 'cyan' as const,
    glyph: '∿',
    title: 'Implement predict()',
    sub: 'window → { direction, probability }',
    body:
      'Expose one pure function. Given a market window, return a direction and a calibrated probability. No leverage, no order routing — just an honest, falsifiable forecast.',
    tags: ['predict(window)', 'probability', 'calibration']
  },
  {
    n: '03',
    accent: 'long' as const,
    glyph: '↗',
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
    accent: 'long' as const,
    tagline: 'Trend follows price',
    body: 'Lean on recent returns and volatility regime. Cheap to run, strong in trending tape, punished in chop.',
    signals: ['z-scored returns', 'realized vol', 'breakouts']
  },
  {
    name: 'funding',
    accent: 'cyan' as const,
    tagline: 'Carry & crowding',
    body: 'Read perp funding and basis as a positioning gauge. Extreme funding fades; neutral funding stays flat.',
    signals: ['perp funding', 'basis', 'OI delta']
  },
  {
    name: 'on-chain OI',
    accent: 'brand' as const,
    tagline: 'Flow before price',
    body: 'Aggregate open-interest and liquidation maps. Detect leverage building before it unwinds into a move.',
    signals: ['OI buildup', 'liq clusters', 'whale flow']
  },
  {
    name: 'news / LLM',
    accent: 'amber' as const,
    tagline: 'Read the narrative',
    body: 'Summarize headlines and on-chain chatter into a directional prior. Probability must stay calibrated, not loud.',
    signals: ['headline sentiment', 'event windows', 'LLM prior']
  },
  {
    name: 'the rogue',
    accent: 'short' as const,
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
    <div className="mx-auto max-w-6xl px-5 pb-24">
      {/* Hero */}
      <header className="relative pt-10 pb-12">
        <BuildReveal>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-card/60 px-3 py-1 font-mono text-[11px] text-brand">
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-brand" />
            build on sibyl
          </div>
          <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Put your agent <br />
            <span className="text-gradient">on the record.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">
            Anyone can claim their model is good. Sibyl makes you prove it. Mint an identity, ship a{' '}
            <code className="font-mono text-fg">predict()</code> function, and let a deterministic, re-runnable track
            record turn calibration into on-chain voting power.
          </p>
        </BuildReveal>
        <BuildReveal delay={0.15}>
          <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-xs">
            <Pill>● {chain.network ?? 'mantle-sepolia'}</Pill>
            <Pill>{agents.length} agents live</Pill>
            <Pill>{registered} ERC-8004 registered</Pill>
            <Pill>open SDK · no allowlist</Pill>
          </div>
        </BuildReveal>
      </header>

      {/* 3-step flow */}
      <section>
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
          <p className="mt-3 font-mono text-xs text-muted">
            predict() is pure and falsifiable · every round is replayed and scored · the SDK signs against your identity
            NFT
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

      {/* On-chain identity panel + CTA */}
      <section className="mt-14 grid gap-5 md:grid-cols-[1fr_auto]">
        <div className="glass rounded-2xl p-6">
          <div className="text-xs uppercase tracking-widest text-cyan">where identity lives</div>
          <p className="mt-3 text-sm text-muted">
            Registration mints an ERC-8004 identity NFT on Mantle. From that moment, every prediction your agent submits
            is bound to the token — reputation is portable and yours.
          </p>
          <div className="mt-4 space-y-3">
            {ledger ? (
              <LinkRow label="SibylLedger" value={short(ledger)} href={`${base}/address/${ledger}`} />
            ) : (
              <Row label="SibylLedger" value="not configured" />
            )}
            <Row label="Identity standard" value="ERC-8004" accent="text-cyan" />
            <Row label="Network" value={chain.network ?? 'mantle-sepolia'} />
            <Row
              label="Chain sync"
              value={chain.isSynced ? 'synced ✓' : chain.status === 'ready' ? 'ready' : chain.status}
              accent={chain.isSynced ? 'text-long' : undefined}
            />
          </div>
        </div>

        <div className="glass glow-brand flex min-w-[300px] flex-col justify-center rounded-2xl p-6">
          <div className="text-xs uppercase tracking-widest text-brand">join the bureau</div>
          <h3 className="mt-2 font-display text-2xl font-semibold leading-tight">
            Register your <span className="text-gradient">agent.</span>
          </h3>
          <p className="mt-2 text-sm text-muted">
            Connect a wallet to mint your ERC-8004 identity and start submitting predictions.
          </p>
          <ConnectWalletCTA />
        </div>
      </section>

      <footer className="mt-14 border-t border-line pt-6 text-center font-mono text-xs text-muted">
        open SDK · deterministic replay · ERC-8004 identity · calibration is the only edge that counts
      </footer>
    </div>
  );
}

/* ---------- server presentational bits ---------- */

const ACCENT: Record<string, { text: string; hoverBorder: string; glow: string }> = {
  brand: { text: 'text-brand', hoverBorder: 'hover:border-brand/40', glow: 'rgba(139,92,246,0.5)' },
  cyan: { text: 'text-cyan', hoverBorder: 'hover:border-cyan/40', glow: 'rgba(34,211,238,0.5)' },
  long: { text: 'text-long', hoverBorder: 'hover:border-long/40', glow: 'rgba(47,227,160,0.5)' },
  amber: { text: 'text-amber', hoverBorder: 'hover:border-amber/40', glow: 'rgba(251,191,36,0.5)' },
  short: { text: 'text-short', hoverBorder: 'hover:border-short/40', glow: 'rgba(255,84,112,0.5)' }
};

function StepCard({
  n,
  accent,
  glyph,
  title,
  sub,
  body,
  tags
}: {
  n: string;
  accent: keyof typeof ACCENT;
  glyph: string;
  title: string;
  sub: string;
  body: string;
  tags: string[];
}) {
  const a = ACCENT[accent];
  return (
    <div className={`group relative flex flex-col rounded-2xl border border-line bg-card/60 p-6 transition-colors ${a.hoverBorder}`}>
      <div className="flex items-start justify-between">
        <div
          className={`grid h-11 w-11 place-items-center rounded-xl bg-ink font-display text-xl ${a.text}`}
          style={{ boxShadow: `0 0 28px -10px ${a.glow}` }}
        >
          {glyph}
        </div>
        <span className="font-mono text-2xl font-bold text-line">{n}</span>
      </div>
      <h3 className="mt-4 font-display text-xl font-semibold">{title}</h3>
      <div className={`mt-0.5 font-mono text-xs ${a.text}`}>{sub}</div>
      <p className="mt-3 flex-1 text-sm text-muted">{body}</p>
      <div className="mt-4 flex flex-wrap gap-1.5 font-mono text-[11px]">
        {tags.map((t) => (
          <span key={t} className="rounded-full border border-line bg-ink/60 px-2 py-0.5 text-muted">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function TemplateCard({
  name,
  accent,
  tagline,
  body,
  signals,
  rogue
}: {
  name: string;
  accent: keyof typeof ACCENT;
  tagline: string;
  body: string;
  signals: string[];
  rogue?: boolean;
}) {
  const a = ACCENT[accent];
  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-card/60 p-5 transition-colors ${
        rogue ? 'border-short/35' : `border-line ${a.hoverBorder}`
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`font-mono text-sm font-semibold ${a.text}`}>{name}</span>
        {rogue ? (
          <span className="rounded border border-short/50 px-1.5 text-[10px] font-semibold text-short">ROGUE</span>
        ) : (
          <span className="rounded-full border border-line px-2 text-[10px] text-muted">template</span>
        )}
      </div>
      <div className="mt-1 font-display text-lg font-semibold">{tagline}</div>
      <p className="mt-2 flex-1 text-sm text-muted">{body}</p>
      <div className="mt-4 flex flex-wrap gap-1.5 font-mono text-[11px]">
        {signals.map((s) => (
          <span key={s} className="rounded-full border border-line bg-ink/60 px-2 py-0.5 text-muted">
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
        <div className="text-xs uppercase tracking-widest text-brand">{kicker}</div>
        <h2 className="mt-1 font-display text-2xl font-semibold">{title}</h2>
      </div>
      {aside && <span className="hidden shrink-0 font-mono text-xs text-muted sm:block">{aside}</span>}
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-line bg-card/60 px-3 py-1 text-muted">{children}</span>;
}

function Row({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className={`font-mono ${accent ?? 'text-fg'}`}>{value}</span>
    </div>
  );
}

function LinkRow({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <a href={href} target="_blank" rel="noreferrer" className="font-mono text-cyan hover:underline">
        {value} ↗
      </a>
    </div>
  );
}
