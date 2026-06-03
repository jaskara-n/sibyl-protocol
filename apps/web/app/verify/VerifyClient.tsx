'use client';

import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { ChainStatus, Verification } from '../../lib/api';
import { cn, short } from '../../lib/utils';

const RERUN_CMD = `node data/datasets/generate-frozen.mjs
# then: SHA-256(data/datasets/frozen.csv) == on-chain latestDatasetHash`;

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5, ease: 'easeOut' as const }
};

export function VerifyClient({
  verification,
  chain,
  explorerBase
}: {
  verification: Verification;
  chain: ChainStatus;
  explorerBase: string;
}) {
  const synced = chain.isSynced === true;
  const ledger = chain.ledgerAddress;
  const consensusTx = chain.latestConsensusTx;

  const onchainHash = chain.onchainLatestDatasetHash ?? verification.datasetHash;
  const localHash = chain.localLatestDatasetHash ?? verification.datasetHash;

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24">
      {/* Hero */}
      <header className="relative pt-10 pb-10">
        <motion.div {...fadeUp}>
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-widest text-amber">transparency</span>
            <SyncChip synced={synced} status={chain.status} />
          </div>
          <h1 className="mt-4 font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Don&apos;t trust us.<br />
            <span className="text-gradient">Re-run the proof.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">
            Every reputation score comes from a deterministic replay of a frozen dataset. Recompute it on your own
            machine, hash the output, and confirm it byte-for-byte equals the <span className="text-fg">latestDatasetHash</span>{' '}
            committed on Mantle. Same inputs, same Brier scores, same consensus — provable off-chain and on-chain.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-xs">
            <Pill>● {chain.network ?? 'mantle-sepolia'}</Pill>
            <Pill>{verification.rows ?? '—'} windows scored</Pill>
            <Pill>scoring v{verification.scoringVersion ?? chain.scoringVersion ?? '—'}</Pill>
            <Pill>260 Foundry tests · on-chain/off-chain parity</Pill>
          </div>
        </motion.div>
      </header>

      {/* The two pillars: deterministic replay + committed hash */}
      <section className="grid gap-5 md:grid-cols-2">
        <motion.div {...fadeUp} className="glass rounded-2xl p-6">
          <div className="text-xs uppercase tracking-widest text-brand">1 · deterministic replay</div>
          <h2 className="mt-2 font-display text-2xl font-semibold">The track record is reproducible.</h2>
          <p className="mt-3 text-sm text-muted">
            Scores aren&apos;t a black box. <span className="text-fg">generate-frozen.mjs</span> replays a fixed window
            of agent signals and outcomes with no randomness and no network calls. Run it twice, run it on any machine —
            you get the exact same CSV every time.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Stat label="windows" value={verification.rows ?? '—'} />
            <Stat label="scoring" value={`v${verification.scoringVersion ?? chain.scoringVersion ?? '—'}`} />
            <Stat label="generated" value={fmtDate(verification.generatedAt)} />
            <Stat label="status" value={verification.status} accent={verification.status === 'ok' ? 'text-long' : 'text-amber'} />
          </div>
        </motion.div>

        <motion.div {...fadeUp} className="glass rounded-2xl p-6">
          <div className="text-xs uppercase tracking-widest text-cyan">2 · committed datasetHash</div>
          <h2 className="mt-2 font-display text-2xl font-semibold">Anchored on Mantle.</h2>
          <p className="mt-3 text-sm text-muted">
            The SHA-256 of the frozen dataset is written on-chain. If a single byte of the track record changed, the hash
            would diverge — and this page would flip to <span className="text-short">not synced</span>.
          </p>
          <div className="mt-5 space-y-3">
            <HashRow label="on-chain" value={onchainHash} accent="text-cyan" />
            <HashRow label="local replay" value={localHash} accent={synced ? 'text-long' : 'text-short'} />
            <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
              <span className="text-muted">parity</span>
              <span className={cn('font-mono font-semibold', synced ? 'text-long' : 'text-short')}>
                {synced ? 'hash == on-chain ✓' : 'awaiting sync'}
              </span>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Verify it yourself — numbered flow */}
      <section className="mt-10">
        <motion.div {...fadeUp} className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-xl font-semibold">Verify it yourself</h2>
          <span className="font-mono text-xs text-muted">~30 seconds, no keys required</span>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-2">
          <Step
            n={1}
            title="Clone and replay"
            body="Run the deterministic generator. It rebuilds the frozen dataset from the committed agent signals — pure computation, no network."
          >
            <CodeBlock text="node data/datasets/generate-frozen.mjs" />
          </Step>

          <Step
            n={2}
            title="Hash the output"
            body="Take the SHA-256 of the regenerated CSV. This is the canonical fingerprint of the entire track record."
          >
            <CodeBlock text="shasum -a 256 data/datasets/frozen.csv" />
          </Step>

          <Step
            n={3}
            title="Compare to on-chain"
            body="Read latestDatasetHash from the SibylLedger on Mantle and confirm it equals your locally computed hash."
          >
            <HashCompare onchain={onchainHash} local={localHash} synced={synced} />
          </Step>

          <Step
            n={4}
            title="Check on/off-chain parity"
            body="16 golden vectors pin the math. The Foundry suite and TS replay assert identical Brier scores and consensus on both sides."
          >
            <div className="flex flex-wrap gap-2 font-mono text-[11px]">
              <Tag color="text-long">16 golden vectors</Tag>
              <Tag color="text-brand">260 Foundry tests</Tag>
              <Tag color="text-cyan">on-chain/off-chain parity</Tag>
              <Tag color="text-amber">deterministic Brier</Tag>
            </div>
          </Step>
        </div>

        <motion.div {...fadeUp} className="mt-4 glass rounded-2xl p-6">
          <div className="text-xs uppercase tracking-widest text-amber">the one-liner</div>
          <p className="mt-2 text-sm text-muted">
            If the hash matches, the on-chain reputation is provably the same one this app shows. No trust required.
          </p>
          <CodeBlock text={RERUN_CMD} className="mt-4" />
        </motion.div>
      </section>

      {/* On/off-chain parity explainer */}
      <section className="mt-10">
        <motion.div {...fadeUp} className="glass rounded-2xl p-6">
          <div className="text-xs uppercase tracking-widest text-brand">on/off-chain parity</div>
          <h2 className="mt-2 font-display text-2xl font-semibold">The same math, twice.</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <ParityCard
              title="16 golden vectors"
              body="Fixed (prediction, outcome) → Brier inputs with hand-checked expected outputs. Both the Solidity scorer and the TS replay must reproduce them exactly."
              color="#2fe3a0"
            />
            <ParityCard
              title="260 Foundry tests"
              body="The on-chain SibylLedger scorer is fuzzed and unit-tested in Foundry — fixed-point Brier, inverse-weighting, per-agent caps, FLAT dead-band."
              color="#8b5cf6"
            />
            <ParityCard
              title="On-chain/off-chain parity"
              body="The off-chain replay is asserted against the same golden vectors and against on-chain reads, so the dashboard can never drift from the contract."
              color="#22d3ee"
            />
          </div>
        </motion.div>
      </section>

      {/* On-chain links */}
      <section className="mt-10">
        <motion.div {...fadeUp} className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-xl font-semibold">On-chain links</h2>
          <span className="font-mono text-xs text-muted">{chain.network ?? 'mantle-sepolia'}</span>
        </motion.div>
        <motion.div {...fadeUp} className="glass rounded-2xl p-6">
          <div className="space-y-3">
            {ledger ? (
              <LinkRow label="SibylLedger" value={short(ledger, 10, 8)} href={`${explorerBase}/address/${ledger}`} />
            ) : (
              <Row label="SibylLedger" value="not configured" />
            )}
            {consensusTx ? (
              <LinkRow
                label="Latest consensus tx"
                value={short(consensusTx, 10, 8)}
                href={`${explorerBase}/tx/${consensusTx}`}
              />
            ) : (
              <Row label="Latest consensus tx" value="—" />
            )}
            <Row label="Explorer" value={explorerBase.replace(/^https?:\/\//, '')} />
            {chain.owner && <Row label="Owner" value={short(chain.owner, 8, 6)} />}
            {chain.epoch !== undefined && <Row label="Epoch" value={chain.epoch} />}
            <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
              <span className="text-muted">Chain sync</span>
              <span className={cn('font-mono font-semibold', synced ? 'text-long' : 'text-amber')}>
                {synced ? 'synced ✓' : chain.status === 'ready' ? 'ready' : chain.status}
              </span>
            </div>
          </div>
        </motion.div>
      </section>

      <footer className="mt-14 border-t border-line pt-6 text-center font-mono text-xs text-muted">
        deterministic replay · committed datasetHash · on/off-chain parity · verifiable by anyone, anytime
      </footer>
    </div>
  );
}

/* ---------- pieces ---------- */

function SyncChip({ synced, status }: { synced: boolean; status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px]',
        synced
          ? 'border-long/40 bg-long/10 text-long'
          : 'border-amber/40 bg-amber/10 text-amber'
      )}
    >
      <span
        className={cn('h-2 w-2 rounded-full', synced ? 'bg-long live-dot' : 'bg-amber')}
        style={synced ? undefined : { boxShadow: '0 0 8px #fbbf24' }}
      />
      {synced ? 'synced — hash matches on-chain' : status === 'pending' ? 'awaiting chain' : 'not synced'}
    </span>
  );
}

function Step({
  n,
  title,
  body,
  children
}: {
  n: number;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      {...fadeUp}
      transition={{ duration: 0.5, ease: 'easeOut', delay: n * 0.06 }}
      className="group glass rounded-2xl p-5 transition-colors hover:border-brand/40"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-linear-to-br from-brand to-cyan font-display font-bold text-ink glow-brand">
          {n}
        </div>
        <div>
          <div className="font-display font-semibold text-fg">{title}</div>
          <p className="mt-1 text-sm text-muted">{body}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </motion.div>
  );
}

function CodeBlock({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className={cn('relative', className)}>
      <pre className="overflow-x-auto rounded-lg border border-line bg-ink p-3 pr-20 font-mono text-[12px] leading-relaxed text-fg/90">
        {text}
      </pre>
      <button
        onClick={copy}
        className={cn(
          'absolute right-2 top-2 rounded-md border px-2 py-1 font-mono text-[11px] transition-colors',
          copied ? 'border-long/50 text-long' : 'border-line text-muted hover:text-fg'
        )}
      >
        {copied ? 'copied ✓' : 'copy'}
      </button>
    </div>
  );
}

function HashCompare({ onchain, local, synced }: { onchain?: string; local?: string | null; synced: boolean }) {
  return (
    <div className="space-y-2">
      <HashRow label="on-chain" value={onchain} accent="text-cyan" small />
      <HashRow label="local" value={local} accent={synced ? 'text-long' : 'text-short'} small />
      <div className="text-center font-mono text-[11px]">
        <span className={synced ? 'text-long' : 'text-short'}>{synced ? '✓ identical' : '… not yet matched'}</span>
      </div>
    </div>
  );
}

function HashRow({
  label,
  value,
  accent,
  small
}: {
  label: string;
  value?: string | null;
  accent?: string;
  small?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <span className={cn('truncate font-mono', small ? 'text-[11px]' : 'text-xs', accent ?? 'text-fg')} title={value ?? undefined}>
        {value ? short(value, small ? 8 : 12, 8) : '—'}
      </span>
    </div>
  );
}

function ParityCard({ title, body, color }: { title: string; body: string; color: string }) {
  return (
    <div className="rounded-xl border border-line bg-card/60 p-4">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        <span className="font-display font-semibold text-fg">{title}</span>
      </div>
      <p className="mt-2 text-sm text-muted">{body}</p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card/60 px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={cn('mt-0.5 font-display text-lg font-semibold', accent ?? 'text-fg')}>{value}</div>
    </div>
  );
}

function Tag({ children, color }: { children: ReactNode; color: string }) {
  return <span className={cn('rounded-full border border-line bg-card/60 px-2.5 py-1', color)}>{children}</span>;
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-line bg-card/60 px-3 py-1 text-muted">{children}</span>;
}

function Row({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className={cn('font-mono', accent ?? 'text-fg')}>{value}</span>
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

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}
