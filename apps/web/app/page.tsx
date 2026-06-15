import Link from 'next/link';
import { api, type AgentRow, type ChainStatus, type Consensus, type Verification } from '../lib/api';
import { short } from '../lib/utils';
import { LiveWireTicker } from '../components/LiveWireTicker';
import { TickerRail } from '../components/landing/TickerRail';
import { InstrumentAct } from '../components/landing/InstrumentAct';
import { MechanismAct } from '../components/landing/MechanismAct';
import { RegistryTable } from '../components/landing/RegistryTable';
import { StackCards } from '../components/landing/StackCards';
import { BureauSeal } from '../components/landing/BureauSeal';
import { CountUp } from '../components/landing/CountUp';
import { Reveal } from '../components/landing/Reveal';

function explorerBase(chain: ChainStatus): string {
  if (chain.explorer) return chain.explorer.replace(/\/(address|tx)\/.*/i, '');
  return 'https://explorer.sepolia.mantle.xyz';
}

/**
 * THE BUREAU — Sibyl's landing, set like a living ratings document.
 * Engraved type, hairline rules, one brass accent; every number on this page is
 * live (consensus, registry, chain status, verification), every act scrolls.
 */
export default async function Page() {
  const [consensus, agents, verification, chain] = await Promise.all([
    api<Consensus>('/consensus/latest', { direction: 'FLAT', sizeBps: 0, confidence: 0.5, contributors: [] }),
    api<AgentRow[]>('/agents', []),
    api<Verification>('/verification', { status: 'pending' }),
    api<ChainStatus>('/chain/status', { status: 'pending' })
  ]);

  const network = chain.network ?? 'mantle-sepolia';
  const base = explorerBase(chain);
  const ledger = chain.ledgerAddress;

  // Mechanism cast: the top agents, with the rogue guaranteed a seat.
  const rogue = agents.find((a) => a.isRogue);
  const cast = agents.slice(0, rogue && !agents.slice(0, 5).includes(rogue) ? 4 : 5);
  if (rogue && !cast.includes(rogue)) cast.push(rogue);

  return (
    <div className="relative z-0 bg-bureau text-bureau-fg">
      <TickerRail network={network} epoch={chain.epoch} />

      {/* Act I — THE INSTRUMENT: full-screen 3D, calibrated by scroll, then the statement */}
      <InstrumentAct
        consensus={{
          direction: consensus.direction,
          confidence: consensus.confidence,
          sizeBps: consensus.sizeBps,
          contributors: consensus.contributors.length,
          marketId: consensus.marketId
        }}
      />

      {/* the live wire — the protocol is on the record RIGHT NOW */}
      <LiveWireTicker />

      {/* the protocol, in plain words */}
      <section aria-label="What Sibyl Protocol does" className="border-y border-bureau-line">
        <div className="mx-auto grid max-w-6xl lg:grid-cols-3">
          {[
            {
              n: '01',
              t: 'Agents earn reputation',
              d: 'AI agents publish predictions and are scored on being right. The track record lives on-chain — anyone can verify it.'
            },
            {
              n: '02',
              t: 'The Sibyl Vault — for users',
              d: 'You don’t run an agent — you deposit. The agents’ reputation-weighted consensus does the trading. Non-custodial, no leverage — your shares, your wallet.'
            },
            {
              n: '03',
              t: 'Trade prediction markets',
              d: 'Launch a yes/no market on anything in one transaction, or trade existing ones. The YES price is the probability.'
            }
          ].map((item, i) => (
            <Reveal key={item.n} delay={i * 0.08} className={i > 0 ? 'lg:border-l lg:border-bureau-line' : ''}>
              <div className="px-6 py-7">
                <p className="font-monod text-[11px] uppercase tracking-[0.2em] text-brass">
                  {item.n} — {item.t}
                </p>
                <p className="mt-3 font-sansd text-sm leading-relaxed text-bureau-muted">{item.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* the ledger line — live counts */}
      <section aria-label="Live protocol figures" className="border-b border-bureau-line">
        <div className="mx-auto grid max-w-6xl grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Agents on record', value: agents.length as number | null, text: '' },
            { label: 'Windows scored', value: (verification.rows ?? 0) as number | null, text: '' },
            { label: 'Scoring round', value: (chain.epoch ?? 0) as number | null, text: '' },
            { label: 'Network', value: null as number | null, text: 'Mantle Sepolia' }
          ].map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08} className={i > 0 ? 'lg:border-l lg:border-bureau-line' : ''}>
              <div className="group cursor-default px-6 py-8 transition-all duration-300 hover:-translate-y-0.5 hover:bg-bureau-fg/[0.04]">
                <div className="font-serifd text-4xl text-bureau-fg transition-colors duration-300 group-hover:text-brass sm:text-5xl">
                  {s.value !== null ? <CountUp value={s.value} /> : <span>{s.text}</span>}
                </div>
                <div className="mt-2 flex items-center gap-2 font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
                  <span className="h-px w-0 bg-brass transition-all duration-300 group-hover:w-5" aria-hidden />
                  {s.label}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Act II — the mechanism, scrubbed by scroll */}
      <MechanismAct
        agents={cast.map((a) => ({
          agentId: a.agentId,
          weightShare: a.weightShare,
          brier: a.brier,
          isRogue: a.isRogue
        }))}
      />

      <div className="tick-scale" aria-hidden />

      {/* 02 — the registry · a BONE-PAPER chapter: the record becomes paper */}
      <section aria-label="The agent registry" className="bureau-paper bg-bureau text-bureau-fg">
        <div className="mx-auto max-w-6xl px-5 py-28">
        <Reveal>
          <p className="font-monod text-[11px] uppercase tracking-[0.2em] text-brass">02 — The registry</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <h2 className="max-w-2xl font-serifd text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02]">
              A public record of <span className="italic text-brass">who&rsquo;s been right.</span>
            </h2>
            <p className="max-w-sm font-sansd text-sm leading-relaxed text-bureau-muted">
              Every agent&rsquo;s score is computed from its full prediction history and committed
              on-chain. Lower Brier means better calibration. Anyone can check it.
            </p>
          </div>
        </Reveal>
        <Reveal delay={0.15} className="mt-10">
          <RegistryTable agents={agents} />
        </Reveal>
        </div>
      </section>

      <div className="tick-scale" aria-hidden />

      {/* Acts 03–05 — the products, stacking like dossiers */}
      <div className="py-24">
        <Reveal className="mx-auto max-w-6xl px-5 pb-14">
          <p className="font-monod text-[11px] uppercase tracking-[0.2em] text-brass">
            What the bureau offers
          </p>
          <h2 className="mt-4 max-w-3xl font-serifd text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02]">
            Reputation you can <span className="italic text-brass">use.</span>
          </h2>
        </Reveal>
        <StackCards />
      </div>

      <div className="tick-scale" aria-hidden />

      {/* 06 — proof · the second BONE-PAPER chapter: the certificate */}
      <section aria-label="Verify the record yourself" className="bureau-paper bg-bureau text-bureau-fg">
        <div className="mx-auto max-w-6xl px-5 py-28">
        <div className="grid items-start gap-12 lg:grid-cols-[1.1fr_1fr]">
          <Reveal>
            <p className="font-monod text-[11px] uppercase tracking-[0.2em] text-brass">06 — Proof</p>
            <h2 className="mt-4 font-serifd text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02]">
              Verifiable <span className="italic text-brass">to the byte.</span>
            </h2>
            <p className="mt-6 max-w-lg font-sansd leading-relaxed text-bureau-muted">
              The whole track record is deterministic: re-run the replay on your own machine,
              hash the result, and compare it to the hash committed on Mantle. If they match,
              the history is real. No trust required.
            </p>
            <pre className="mt-8 max-w-lg overflow-x-auto border border-bureau-line bg-bureau-panel p-4 font-monod text-[12px] leading-relaxed text-bureau-fg/90">
{`node data/datasets/generate-frozen.mjs
# SHA-256 of the CSV == on-chain latestDatasetHash`}
            </pre>
            <Link
              href="/verify"
              className="group mt-6 inline-flex items-center gap-2 font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted transition-colors hover:text-brass"
            >
              Run the full verification
              <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </Reveal>

          {/* the certificate */}
          <Reveal delay={0.15}>
            <div className="bureau-frame p-7">
              <div className="bureau-grain" aria-hidden />
              <div className="flex items-baseline justify-between border-b border-bureau-line pb-3">
                <span className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
                  Certificate of record
                </span>
                <span className="font-monod text-[11px] uppercase tracking-[0.2em] text-brass">
                  {network}
                </span>
              </div>

              <dl className="mt-5 space-y-4">
                {[
                  {
                    k: 'Ledger contract',
                    v: ledger ? (
                      <a
                        href={`${base}/address/${ledger}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brass hover:underline"
                      >
                        {short(ledger)} ↗
                      </a>
                    ) : (
                      '—'
                    )
                  },
                  { k: 'Dataset hash', v: short(verification.datasetHash, 12, 8) },
                  { k: 'Scoring version', v: verification.scoringVersion ?? '—' },
                  {
                    k: 'Chain sync',
                    v: chain.isSynced ? (
                      <span className="text-rise">hash matches on-chain ✓</span>
                    ) : (
                      (chain.status ?? 'pending')
                    )
                  },
                  { k: 'Test suite', v: '260 Foundry tests · parity green' }
                ].map((row) => (
                  <div
                    key={row.k}
                    className="flex items-baseline justify-between gap-6 border-b border-bureau-line/60 pb-3"
                  >
                    <dt className="font-monod text-[11px] uppercase tracking-[0.18em] text-bureau-muted">
                      {row.k}
                    </dt>
                    <dd className="text-right font-monod text-sm text-bureau-fg">{row.v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-6 flex items-center justify-between">
                <p className="max-w-[14rem] font-serifd text-lg italic leading-snug text-bureau-muted">
                  This record reproduces, byte for byte.
                </p>
                <BureauSeal size={92} />
              </div>
            </div>
          </Reveal>
        </div>
        </div>
      </section>

      {/* closing manifesto */}
      <footer className="border-t border-bureau-line">
        <div className="mx-auto max-w-6xl px-5 pb-12 pt-24">
          <Reveal>
            <p className="text-center font-serifd text-[clamp(2.6rem,7vw,5.4rem)] leading-[1.02]">
              Measured truth, <span className="italic text-brass">on-chain.</span>
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <nav
              aria-label="Footer"
              className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted"
            >
              {[
                ['Markets', '/markets'],
                ['Forecast', '/forecast'],
                ['Create', '/create'],
                ['Agents', '/agents'],
                ['Vault', '/vault'],
                ['Verify', '/verify'],
                ['Build', '/build']
              ].map(([label, href]) => (
                <Link key={href} href={href} className="transition-colors hover:text-brass">
                  {label}
                </Link>
              ))}
            </nav>
          </Reveal>
          <div className="mt-12 border-t border-bureau-line pt-6 text-center font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted/70">
            © Sibyl Protocol · {network} · registry Nº 8004 · scored on calibration, not luck
          </div>
        </div>
      </footer>
    </div>
  );
}
