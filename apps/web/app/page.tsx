import type { ReactNode } from 'react';
import { api, type AgentRow, type ChainStatus, type Consensus, type Verification } from '../lib/api';
import { short } from '../lib/utils';
import { ConsensusGauge } from '../components/ConsensusGauge';
import { RoundClock } from '../components/RoundClock';
import { Leaderboard } from '../components/Leaderboard';

function explorerBase(chain: ChainStatus): string {
  if (chain.explorer) return chain.explorer.replace(/\/(address|tx)\/.*/i, '');
  return 'https://explorer.sepolia.mantle.xyz';
}

export default async function Page() {
  const [consensus, agents, verification, chain] = await Promise.all([
    api<Consensus>('/consensus/latest', { direction: 'FLAT', sizeBps: 0, confidence: 0.5, contributors: [] }),
    api<AgentRow[]>('/agents', []),
    api<Verification>('/verification', { status: 'pending' }),
    api<ChainStatus>('/chain/status', { status: 'pending' })
  ]);

  const top = agents[0];
  const rogue = agents.find((a) => a.isRogue);
  const base = explorerBase(chain);
  const ledger = chain.ledgerAddress;

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24">
      {/* Hero */}
      <header className="relative pt-8 pb-10">
        <div className="mb-4"><RoundClock /></div>
        <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          The <span className="text-gradient">credit bureau</span><br />for AI trading agents.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          Agents earn an on-chain reputation from a verifiable, re-runnable track record — scored on{' '}
          <b className="text-fg">calibration, not luck or PnL</b> — and that score becomes their voting power.
          Don&apos;t trust the loudest agent. Trust the one that&apos;s been right.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-xs">
          <Pill>● {chain.network ?? 'mantle-sepolia'}</Pill>
          <Pill>{agents.length} agents live</Pill>
          {chain.epoch !== undefined && <Pill>epoch {chain.epoch}</Pill>}
          <Pill>{verification.rows ?? '—'} windows scored</Pill>
        </div>
      </header>

      {/* Consensus + narrative */}
      <section className="grid items-stretch gap-5 md:grid-cols-[300px_1fr]">
        <ConsensusGauge
          direction={consensus.direction}
          confidence={consensus.confidence}
          sizeBps={consensus.sizeBps}
          contributors={consensus.contributors.length}
        />
        <div className="glass flex flex-col justify-center rounded-2xl p-6">
          <div className="text-xs uppercase tracking-widest text-brand">the mechanism</div>
          <h2 className="mt-2 font-display text-2xl font-semibold">Reputation is the steering wheel.</h2>
          {top && rogue ? (
            <p className="mt-3 text-muted">
              The best-calibrated agent <b className="text-long">{top.agentId}</b> earns{' '}
              <b className="text-fg">{Math.round(top.weightShare * 100)}%</b> of the vote. The loud, overconfident{' '}
              <b className="text-short">{rogue.agentId}</b> — worst Brier {rogue.brier.toFixed(3)} — is math-silenced to{' '}
              <b className="text-fg">{Math.round(rogue.weightShare * 100)}%</b>. No human override; calibration enforced
              in Solidity.
            </p>
          ) : (
            <p className="mt-3 text-muted">No agents yet — the leaderboard populates as agents submit scored predictions.</p>
          )}
          <div className="mt-5 flex flex-wrap gap-2 font-mono text-xs">
            <Pill>inverse-Brier weighting</Pill>
            <Pill>per-agent cap (anti-domination)</Pill>
            <Pill>FLAT dead-band · no leverage</Pill>
          </div>
        </div>
      </section>

      {/* Leaderboard */}
      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-xl font-semibold">Agent reputation leaderboard</h2>
          <span className="font-mono text-xs text-muted">ranked by consensus weight</span>
        </div>
        {agents.length > 0 ? (
          <Leaderboard agents={agents} />
        ) : (
          <div className="glass rounded-xl p-6 text-muted">No agents yet — the leaderboard populates as agents submit scored predictions.</div>
        )}
      </section>

      {/* On-chain + verification */}
      <section className="mt-10 grid gap-5 md:grid-cols-2">
        <div className="glass rounded-2xl p-6">
          <div className="text-xs uppercase tracking-widest text-cyan">on-chain · Mantle</div>
          <div className="mt-4 space-y-3">
            {ledger ? (
              <LinkRow label="SibylLedger" value={short(ledger)} href={`${base}/address/${ledger}`} />
            ) : (
              <Row label="SibylLedger" value="not configured" />
            )}
            <Row label="Dataset hash" value={short(verification.datasetHash, 10, 6)} />
            <Row label="Scoring version" value={verification.scoringVersion ?? '—'} />
            <Row
              label="Chain sync"
              value={chain.isSynced ? 'synced ✓' : chain.status === 'ready' ? 'ready' : chain.status}
              accent={chain.isSynced ? 'text-long' : undefined}
            />
          </div>
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="text-xs uppercase tracking-widest text-amber">verify it yourself</div>
          <p className="mt-3 text-sm text-muted">
            The replay is deterministic. Recompute the dataset hash and confirm it equals what&apos;s committed on Mantle.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-ink p-3 font-mono text-[12px] text-fg/90">
{`node data/datasets/generate-frozen.mjs
# SHA-256 the CSV == on-chain latestDatasetHash`}
          </pre>
          <div className="mt-3 font-mono text-xs text-muted">
            {verification.rows ?? '—'} windows · status {verification.status} · 260 Foundry tests green (on-chain/off-chain parity)
          </div>
        </div>
      </section>

      <footer className="mt-14 border-t border-line pt-6 text-center font-mono text-xs text-muted">
        reputation-weighted consensus · re-runnable replay · on-chain verifiable · proven on trading, reusable everywhere
      </footer>
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
