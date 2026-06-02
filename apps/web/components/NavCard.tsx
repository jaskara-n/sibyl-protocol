import type { ReactNode } from 'react';

/**
 * Vault NAV summary — total assets under management, idle cash, and the
 * ERC-4626 share price, sourced from GET /vault/nav.
 *
 * NAV invariant (mirrors SibylVault.totalAssets): totalAssets == cash + sum(positions).
 */
export function NavCard({
  totalAssets,
  cash,
  sharePrice
}: {
  totalAssets: number;
  cash: number;
  sharePrice: number;
}) {
  const deployed = Math.max(0, totalAssets - cash);
  const deployedPct = totalAssets > 0 ? Math.round((deployed / totalAssets) * 100) : 0;

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-brand">net asset value</div>
        <span className="rounded-full border border-line bg-card/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted">
          ERC-4626
        </span>
      </div>

      <div className="mt-4 font-display text-4xl font-bold tracking-tight">
        {totalAssets.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        <span className="ml-2 align-middle font-mono text-sm font-normal text-muted">assets</span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Stat label="idle cash" value={cash.toLocaleString(undefined, { maximumFractionDigits: 2 })} accent="text-cyan" />
        <Stat
          label="deployed"
          value={deployed.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          accent="text-long"
        />
        <Stat
          label="share price"
          value={sharePrice.toLocaleString(undefined, { maximumFractionDigits: 6 })}
          accent="text-brand"
        />
      </div>

      {/* Cash vs deployed split */}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between font-mono text-[11px] text-muted">
          <span>capital deployed</span>
          <span>{deployedPct}%</span>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink">
          <div
            className="h-full bg-linear-to-r from-brand to-cyan"
            style={{ width: `${deployedPct}%`, boxShadow: '0 0 12px rgba(139,92,246,0.6)' }}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card/40 p-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-1 font-mono text-sm font-semibold ${accent ?? 'text-fg'}`}>{value}</div>
    </div>
  );
}
