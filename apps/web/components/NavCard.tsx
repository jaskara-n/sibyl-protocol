import type { ReactNode } from 'react';

/**
 * Vault NAV summary — total assets under management, idle cash, and the
 * ERC-4626 share price, sourced from GET /vault/nav. Set as a bureau
 * certificate: serif numerals, ruled figure rows, a thin brass deployment gauge.
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
    <div className="bureau-frame p-6">
      <div className="bureau-grain" aria-hidden />

      <div className="flex items-baseline justify-between border-b border-bureau-line pb-3">
        <span className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
          Net asset value
        </span>
        <span className="border border-bureau-line px-2 py-0.5 font-monod text-[11px] uppercase tracking-[0.18em] text-brass">
          ERC-4626
        </span>
      </div>

      <div className="mt-6 font-serifd text-[clamp(2.6rem,6vw,4rem)] leading-[1] text-bureau-fg">
        {totalAssets.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        <span className="ml-3 align-baseline font-monod text-sm uppercase tracking-[0.2em] text-bureau-muted">
          assets
        </span>
      </div>

      {/* Ruled figure ledger */}
      <dl className="mt-6 border-t border-bureau-line/60">
        <Figure label="Idle cash" value={cash.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
        <Figure label="Deployed" value={deployed.toLocaleString(undefined, { maximumFractionDigits: 2 })} accent="text-rise" />
        <Figure
          label="Share price"
          value={sharePrice.toLocaleString(undefined, { maximumFractionDigits: 6 })}
          accent="text-brass"
        />
      </dl>

      {/* Cash vs deployed split — thin brass gauge */}
      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
          <span>Capital deployed</span>
          <span className="text-bureau-fg">{deployedPct}%</span>
        </div>
        <div
          role="img"
          aria-label={`Capital deployed ${deployedPct} percent`}
          className="h-[3px] w-full bg-bureau-line/60"
        >
          <div className="h-full bg-brass" style={{ width: `${deployedPct}%` }} />
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-bureau-line/60 py-3">
      <dt className="font-monod text-[11px] uppercase tracking-[0.18em] text-bureau-muted">{label}</dt>
      <dd className={`font-serifd text-2xl leading-none ${accent ?? 'text-bureau-fg'}`}>{value}</dd>
    </div>
  );
}
