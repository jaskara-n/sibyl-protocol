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
    <div className="relative z-0 bg-bureau text-bureau-fg">
      <div className="mx-auto max-w-6xl px-5 pb-24">
        {/* Header */}
        <header className="relative pt-12 pb-10">
          <motion.div {...fadeUp}>
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-monod text-[11px] uppercase tracking-[0.42em] text-brass">Proof</p>
              <SyncChip synced={synced} status={chain.status} />
            </div>
            <h1 className="mt-4 max-w-3xl font-serifd text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02]">
              Don&apos;t trust us. <span className="italic text-brass">Re-run</span> the proof.
            </h1>
            <p className="mt-5 max-w-2xl font-sansd text-base leading-relaxed text-bureau-muted">
              Every reputation score comes from a deterministic replay of a frozen dataset. Recompute it on your own
              machine, hash the output, and confirm it byte-for-byte equals the{' '}
              <span className="text-bureau-fg">latestDatasetHash</span> committed on Mantle. Same inputs, same Brier
              scores, same consensus — provable off-chain and on-chain.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-2">
              <Stamp>{chain.network ?? 'mantle-sepolia'}</Stamp>
              <Stamp>{verification.rows ?? '—'} windows scored</Stamp>
              <Stamp>scoring v{verification.scoringVersion ?? chain.scoringVersion ?? '—'}</Stamp>
              <Stamp>260 Foundry tests · on-chain/off-chain parity</Stamp>
            </div>
          </motion.div>
        </header>

        <div className="tick-scale" aria-hidden />

        {/* The two pillars: deterministic replay + committed hash */}
        <section className="mt-10 grid gap-5 md:grid-cols-2">
          <motion.div {...fadeUp} className="bureau-frame p-6">
            <div className="bureau-grain" aria-hidden />
            <div className="font-monod text-[10px] uppercase tracking-[0.3em] text-brass">01 · deterministic replay</div>
            <h2 className="mt-2 font-serifd text-[clamp(1.5rem,2.6vw,2rem)] leading-tight">
              The track record is reproducible.
            </h2>
            <p className="mt-3 font-sansd text-sm leading-relaxed text-bureau-muted">
              Scores aren&apos;t a black box. <span className="text-bureau-fg">generate-frozen.mjs</span> replays a fixed
              window of agent signals and outcomes with no randomness and no network calls. Run it twice, run it on any
              machine — you get the exact same CSV every time.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Stat label="windows" value={verification.rows ?? '—'} />
              <Stat label="scoring" value={`v${verification.scoringVersion ?? chain.scoringVersion ?? '—'}`} />
              <Stat label="generated" value={fmtDate(verification.generatedAt)} />
              <Stat label="status" value={verification.status} accent={verification.status === 'ok' ? 'text-rise' : 'text-brass'} />
            </div>
          </motion.div>

          <motion.div {...fadeUp} className="bureau-frame p-6">
            <div className="bureau-grain" aria-hidden />
            <div className="font-monod text-[10px] uppercase tracking-[0.3em] text-brass">02 · committed datasetHash</div>
            <h2 className="mt-2 font-serifd text-[clamp(1.5rem,2.6vw,2rem)] leading-tight">Anchored on Mantle.</h2>
            <p className="mt-3 font-sansd text-sm leading-relaxed text-bureau-muted">
              The SHA-256 of the frozen dataset is written on-chain. If a single byte of the track record changed, the
              hash would diverge — and this page would flip to <span className="text-fall">not synced</span>.
            </p>
            <div className="mt-5 space-y-3">
              <HashRow label="on-chain" value={onchainHash} accent="text-brass" />
              <HashRow label="local replay" value={localHash} accent={synced ? 'text-rise' : 'text-fall'} />
              <div className="flex items-center justify-between border-t border-bureau-line pt-3 text-sm">
                <span className="font-monod text-[10px] uppercase tracking-[0.2em] text-bureau-muted">parity</span>
                <span className={cn('font-monod font-medium', synced ? 'text-rise' : 'text-fall')}>
                  {synced ? 'hash == on-chain ✓' : 'awaiting sync'}
                </span>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Verify it yourself — numbered flow */}
        <section className="mt-14">
          <motion.div {...fadeUp} className="mb-5 flex items-end justify-between gap-4">
            <div>
              <div className="font-monod text-[10px] uppercase tracking-[0.3em] text-brass">verify it yourself</div>
              <h2 className="mt-1 font-serifd text-[clamp(1.5rem,2.6vw,2rem)] leading-tight">Four steps, no keys.</h2>
            </div>
            <span className="hidden shrink-0 font-monod text-[11px] uppercase tracking-[0.18em] text-bureau-muted sm:block">
              ~30 seconds
            </span>
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
              <div className="flex flex-wrap gap-2 font-monod text-[11px]">
                <Tag color="text-rise">16 golden vectors</Tag>
                <Tag color="text-brass">260 Foundry tests</Tag>
                <Tag color="text-bureau-fg">on-chain/off-chain parity</Tag>
                <Tag color="text-bureau-muted">deterministic Brier</Tag>
              </div>
            </Step>
          </div>

          <motion.div {...fadeUp} className="mt-4 bureau-frame p-6">
            <div className="bureau-grain" aria-hidden />
            <div className="font-monod text-[10px] uppercase tracking-[0.3em] text-brass">the one-liner</div>
            <p className="mt-2 font-sansd text-sm leading-relaxed text-bureau-muted">
              If the hash matches, the on-chain reputation is provably the same one this app shows. No trust required.
            </p>
            <CodeBlock text={RERUN_CMD} className="mt-4" />
          </motion.div>
        </section>

        <div className="tick-scale mt-14" aria-hidden />

        {/* The certificate — a BONE-PAPER chapter */}
        <section className="mt-14 bureau-paper bg-bureau text-bureau-fg">
          <div className="bureau-frame p-7">
            <div className="bureau-grain" aria-hidden />
            <div className="flex items-baseline justify-between border-b border-bureau-line pb-3">
              <span className="font-monod text-[10px] uppercase tracking-[0.32em] text-bureau-muted">
                On/off-chain parity
              </span>
              <span className="font-monod text-[10px] uppercase tracking-[0.32em] text-brass">
                {chain.network ?? 'mantle-sepolia'}
              </span>
            </div>
            <h2 className="mt-5 font-serifd text-[clamp(1.6rem,3vw,2.4rem)] leading-tight">
              The same math, <span className="italic text-brass">twice.</span>
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <ParityCard
                title="16 golden vectors"
                body="Fixed (prediction, outcome) → Brier inputs with hand-checked expected outputs. Both the Solidity scorer and the TS replay must reproduce them exactly."
              />
              <ParityCard
                title="260 Foundry tests"
                body="The on-chain SibylLedger scorer is fuzzed and unit-tested in Foundry — fixed-point Brier, inverse-weighting, per-agent caps, FLAT dead-band."
              />
              <ParityCard
                title="On-chain/off-chain parity"
                body="The off-chain replay is asserted against the same golden vectors and against on-chain reads, so the dashboard can never drift from the contract."
              />
            </div>
          </div>
        </section>

        {/* On-chain links */}
        <section className="mt-14">
          <motion.div {...fadeUp} className="mb-5 flex items-end justify-between gap-4">
            <div>
              <div className="font-monod text-[10px] uppercase tracking-[0.3em] text-brass">on-chain links</div>
              <h2 className="mt-1 font-serifd text-[clamp(1.5rem,2.6vw,2rem)] leading-tight">The record on Mantle.</h2>
            </div>
            <span className="hidden shrink-0 font-monod text-[11px] uppercase tracking-[0.18em] text-bureau-muted sm:block">
              {chain.network ?? 'mantle-sepolia'}
            </span>
          </motion.div>
          <motion.div {...fadeUp} className="bureau-frame p-6">
            <div className="bureau-grain" aria-hidden />
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
              <div className="flex items-center justify-between border-t border-bureau-line pt-3 text-sm">
                <span className="font-monod text-[10px] uppercase tracking-[0.2em] text-bureau-muted">Chain sync</span>
                <span className={cn('font-monod font-medium', synced ? 'text-rise' : 'text-brass')}>
                  {synced ? 'synced ✓' : chain.status === 'ready' ? 'ready' : chain.status}
                </span>
              </div>
            </div>
          </motion.div>
        </section>

        <footer className="mt-14 border-t border-bureau-line pt-6 text-center font-monod text-[10px] uppercase tracking-[0.3em] text-bureau-muted/70">
          deterministic replay · committed datasetHash · on/off-chain parity · verifiable by anyone, anytime
        </footer>
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

function SyncChip({ synced, status }: { synced: boolean; status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 border px-2.5 py-0.5 font-monod text-[10px] uppercase tracking-[0.18em]',
        synced ? 'border-rise text-rise' : 'border-brass text-brass'
      )}
    >
      <span
        className={cn('h-2 w-2 rounded-full', synced ? 'live-dot' : '')}
        style={{ background: synced ? 'var(--color-rise)' : 'var(--color-brass)', boxShadow: synced ? '0 0 8px var(--color-rise)' : undefined }}
        aria-hidden
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
      className="group bureau-frame p-5 transition-colors hover:border-brass"
    >
      <div className="bureau-grain" aria-hidden />
      <div className="flex items-start gap-4">
        <span className="font-serifd text-3xl leading-none text-brass">{String(n).padStart(2, '0')}</span>
        <div>
          <div className="font-sansd font-semibold text-bureau-fg">{title}</div>
          <p className="mt-1 font-sansd text-sm leading-relaxed text-bureau-muted">{body}</p>
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
      <pre className="overflow-x-auto border border-bureau-line bg-bureau p-3 pr-20 font-monod text-[12px] leading-relaxed text-bureau-fg/90">
        {text}
      </pre>
      <button
        onClick={copy}
        className={cn(
          'absolute right-2 top-2 border px-2 py-1 font-monod text-[10px] uppercase tracking-[0.14em] transition-colors',
          copied ? 'border-rise text-rise' : 'border-bureau-line text-bureau-muted hover:border-brass hover:text-brass'
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
      <HashRow label="on-chain" value={onchain} accent="text-brass" small />
      <HashRow label="local" value={local} accent={synced ? 'text-rise' : 'text-fall'} small />
      <div className="text-center font-monod text-[11px]">
        <span className={synced ? 'text-rise' : 'text-fall'}>{synced ? '✓ identical' : '… not yet matched'}</span>
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
      <span className="shrink-0 font-monod text-[10px] uppercase tracking-[0.2em] text-bureau-muted">{label}</span>
      <span className={cn('truncate font-monod', small ? 'text-[11px]' : 'text-xs', accent ?? 'text-bureau-fg')} title={value ?? undefined}>
        {value ? short(value, small ? 8 : 12, 8) : '—'}
      </span>
    </div>
  );
}

function ParityCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-bureau-line bg-bureau-panel p-4">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--color-brass)' }} aria-hidden />
        <span className="font-sansd font-semibold text-bureau-fg">{title}</span>
      </div>
      <p className="mt-2 font-sansd text-sm leading-relaxed text-bureau-muted">{body}</p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="border border-bureau-line bg-bureau-panel px-3 py-2.5">
      <div className="font-monod text-[10px] uppercase tracking-[0.2em] text-bureau-muted">{label}</div>
      <div className={cn('mt-0.5 font-serifd text-lg', accent ?? 'text-bureau-fg')}>{value}</div>
    </div>
  );
}

function Tag({ children, color }: { children: ReactNode; color: string }) {
  return <span className={cn('border border-bureau-line bg-bureau-panel px-2.5 py-1', color)}>{children}</span>;
}

function Stamp({ children }: { children: ReactNode }) {
  return (
    <span className="border border-bureau-line px-2.5 py-0.5 font-monod text-[10px] uppercase tracking-[0.18em] text-bureau-muted">
      {children}
    </span>
  );
}

function Row({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="font-monod text-[10px] uppercase tracking-[0.2em] text-bureau-muted">{label}</span>
      <span className={cn('font-monod', accent ?? 'text-bureau-fg')}>{value}</span>
    </div>
  );
}

function LinkRow({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="font-monod text-[10px] uppercase tracking-[0.2em] text-bureau-muted">{label}</span>
      <a href={href} target="_blank" rel="noreferrer" className="font-monod text-brass hover:underline">
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
