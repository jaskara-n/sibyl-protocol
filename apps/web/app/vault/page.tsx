import type { ReactNode } from 'react';
import { api, type VaultNav, type VaultPosition } from '../../lib/api';
import { NavCard } from '../../components/NavCard';
import { PositionTable } from '../../components/PositionTable';
import { VaultForm } from '../../components/VaultForm';

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function VaultPage() {
  const [nav, positions] = await Promise.all([
    api<VaultNav>('/vault/nav', { totalAssets: '0', cash: '0', sharePrice: '1' }),
    api<VaultPosition[]>('/vault/positions', [])
  ]);

  const totalAssets = num(nav.totalAssets);
  const cash = num(nav.cash);
  const sharePrice = num(nav.sharePrice) || 1;

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24">
      {/* Hero */}
      <header className="relative pt-8 pb-8">
        <div className="text-xs uppercase tracking-widest text-brand">the strategy vault</div>
        <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
          An <span className="text-gradient">ERC-4626 vault</span> steered by reputation.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          The vault routes idle cash into spot positions sized by each market&apos;s reputation-weighted
          consensus. NAV is idle cash plus the value of open venue positions — no leverage, no borrow path.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-xs">
          <Pill>{totalAssets.toLocaleString(undefined, { maximumFractionDigits: 0 })} assets</Pill>
          <Pill className="text-cyan">{positions.length} positions</Pill>
          <Pill className="text-long">live deposit / withdraw on Mantle Sepolia</Pill>
        </div>
      </header>

      {/* NAV + simulate form */}
      <section className="grid items-start gap-5 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-5">
          <NavCard totalAssets={totalAssets} cash={cash} sharePrice={sharePrice} />
          <div>
            <div className="mb-3 flex items-end justify-between">
              <h2 className="font-display text-xl font-semibold">Open positions</h2>
              <span className="font-mono text-xs text-muted">per-market venue notional</span>
            </div>
            <PositionTable positions={positions} />
          </div>
        </div>
        <VaultForm sharePrice={sharePrice} />
      </section>

      {/* Self-custody banner */}
      <section className="mt-8 rounded-2xl border border-long/30 bg-long/5 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-long/15 font-display text-long">
            ◈
          </span>
          <div>
            <div className="font-display text-sm font-semibold text-long">Self-custody. On-chain.</div>
            <p className="mt-1 text-sm text-muted">
              The vault is a non-custodial ERC-4626 contract on Mantle Sepolia (chain 5003). Deposits and
              withdrawals are real transactions signed by your own wallet: a deposit calls
              {' '}<code className="font-mono text-fg/80">approve</code> (when allowance is insufficient) then{' '}
              <code className="font-mono text-fg/80">deposit(assets, you)</code>, and a withdrawal calls{' '}
              <code className="font-mono text-fg/80">redeem(shares, you, you)</code>. Shares are minted to your
              address — only you can redeem them. Testnet assets only.
            </p>
          </div>
        </div>
      </section>

      <footer className="mt-14 border-t border-line pt-6 text-center font-mono text-xs text-muted">
        NAV = idle cash + venue positions · reputation-weighted sizing · no leverage · live on Mantle Sepolia
      </footer>
    </div>
  );
}

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={`rounded-full border border-line bg-card/60 px-3 py-1 text-muted ${className ?? ''}`}>
      {children}
    </span>
  );
}
