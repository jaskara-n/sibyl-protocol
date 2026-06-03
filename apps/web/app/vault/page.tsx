import type { ReactNode } from 'react';
import { api, type VaultNav, type VaultPosition } from '../../lib/api';
import { NavCard } from '../../components/NavCard';
import { PositionTable } from '../../components/PositionTable';
import { VaultForm } from '../../components/VaultForm';
import { Reveal } from '../../components/landing/Reveal';

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Live API values arrive as 18-decimal wei strings; older builds sent plain units. */
function toUnits(v: unknown): number {
  const n = num(v);
  return n > 1e15 ? n / 1e18 : n;
}

export default async function VaultPage() {
  const [nav, positionsRes] = await Promise.all([
    api<VaultNav>('/vault/nav', { totalAssets: '0', cash: '0', sharePrice: '1' }),
    api<VaultPosition[] | { positions?: VaultPosition[] }>('/vault/positions', [])
  ]);
  // The live API answers with an envelope ({ source, vaultAddress, positions });
  // older builds returned a bare array. Accept both.
  const rawPositions = Array.isArray(positionsRes) ? positionsRes : (positionsRes?.positions ?? []);
  const positions = rawPositions.map((p) => ({ ...p, value: String(toUnits(p.value)) }));

  const totalAssets = toUnits(nav.totalAssets);
  const cash = toUnits(nav.cash);
  const sharePrice = toUnits(nav.sharePrice) || 1;

  return (
    <div className="relative z-0 bg-bureau text-bureau-fg">
      <div className="mx-auto max-w-6xl px-5 pb-24">
        {/* Header */}
        <header className="relative pt-12 pb-8">
          <p className="font-monod text-[11px] uppercase tracking-[0.42em] text-brass">The vault</p>
          <h1 className="mt-4 max-w-3xl font-serifd text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02]">
            An ERC-4626 vault steered by <span className="italic text-brass">reputation.</span>
          </h1>
          <p className="mt-5 max-w-2xl font-sansd text-base leading-relaxed text-bureau-muted">
            The vault routes idle cash into spot positions sized by each market&apos;s reputation-weighted
            consensus. NAV is idle cash plus the value of open venue positions — no leverage, no borrow path.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Stamp>{totalAssets.toLocaleString(undefined, { maximumFractionDigits: 0 })} assets</Stamp>
            <Stamp className="text-brass">{positions.length} positions</Stamp>
            <Stamp className="text-rise">live deposit / withdraw · Mantle Sepolia</Stamp>
          </div>
        </header>

        <div className="tick-scale" aria-hidden />

        {/* NAV + deposit/withdraw form */}
        <section className="mt-10 grid items-start gap-5 lg:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-5">
            <Reveal>
              <NavCard totalAssets={totalAssets} cash={cash} sharePrice={sharePrice} />
            </Reveal>
            <Reveal delay={0.1}>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-serifd text-2xl">Open positions</h2>
                <span className="font-monod text-[11px] uppercase tracking-[0.24em] text-bureau-muted">
                  per-market venue notional
                </span>
              </div>
              <PositionTable positions={positions} />
            </Reveal>
          </div>
          <Reveal delay={0.15}>
            <VaultForm sharePrice={sharePrice} />
          </Reveal>
        </section>

        {/* Self-custody note */}
        <Reveal delay={0.1} className="mt-10">
          <div className="bureau-frame p-6">
            <div className="bureau-grain" aria-hidden />
            <div className="flex items-start gap-4">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center border border-rise/50 font-serifd text-rise">
                ◈
              </span>
              <div>
                <div className="font-monod text-[11px] uppercase tracking-[0.28em] text-rise">
                  Self-custody · on-chain
                </div>
                <p className="mt-2 font-sansd text-sm leading-relaxed text-bureau-muted">
                  The vault is a non-custodial ERC-4626 contract on Mantle Sepolia (chain 5003). Deposits and
                  withdrawals are real transactions signed by your own wallet: a deposit calls
                  {' '}<code className="font-monod text-brass">approve</code> (when allowance is insufficient) then{' '}
                  <code className="font-monod text-brass">deposit(assets, you)</code>, and a withdrawal calls{' '}
                  <code className="font-monod text-brass">redeem(shares, you, you)</code>. Shares are minted to your
                  address — only you can redeem them. Testnet assets only.
                </p>
              </div>
            </div>
          </div>
        </Reveal>

        <footer className="mt-14 border-t border-bureau-line pt-6 text-center font-monod text-[11px] uppercase tracking-[0.3em] text-bureau-muted">
          NAV = idle cash + venue positions · reputation-weighted sizing · no leverage · live on Mantle Sepolia
        </footer>
      </div>
    </div>
  );
}

function Stamp({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`border border-bureau-line px-2 py-0.5 font-monod text-[11px] uppercase tracking-[0.18em] text-bureau-muted ${className ?? ''}`}
    >
      {children}
    </span>
  );
}
