import type { VaultPosition } from '../lib/api';

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Per-market vault positions (venue notional) from GET /vault/positions, set as
 * a bureau ledger: ruled rows, tabular numerals, a thin brass share gauge.
 * The gauge encodes each position's share of total deployed capital.
 */
export function PositionTable({ positions }: { positions: VaultPosition[] }) {
  // Defensive: the API may answer with an envelope or error shape; only an
  // actual array is renderable.
  const source = Array.isArray(positions) ? positions : [];
  const rows = [...source]
    .map((p) => ({ marketId: p.marketId, value: num(p.value) }))
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0);

  if (rows.length === 0) {
    return (
      <div className="bureau-frame p-10 text-center">
        <div className="bureau-grain" aria-hidden />
        <p className="font-serifd text-2xl italic text-bureau-muted">
          No open positions — the vault is holding idle cash.
        </p>
      </div>
    );
  }

  return (
    <div className="bureau-frame overflow-x-auto">
      <div className="bureau-grain" aria-hidden />

      <div className="grid min-w-[320px] grid-cols-[1fr_auto_64px] gap-3 border-b border-bureau-line px-5 py-3 font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
        <span>Market</span>
        <span className="text-right">Value</span>
        <span className="text-right">Share</span>
      </div>
      <ul>
        {rows.map((r) => {
          const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
          return (
            <li
              key={r.marketId}
              className="grid min-w-[320px] grid-cols-[1fr_auto_64px] items-center gap-3 border-b border-bureau-line/60 px-5 py-3.5 last:border-0"
            >
              <span className="min-w-0">
                <span className="block truncate font-monod text-sm text-bureau-fg">{r.marketId}</span>
                <span
                  role="img"
                  aria-label={`Capital share ${pct} percent`}
                  className="mt-1.5 block h-[2px] w-full max-w-[12rem] bg-bureau-line/60"
                >
                  <span className="block h-full bg-brass" style={{ width: `${pct}%` }} />
                </span>
              </span>
              <span className="text-right font-monod text-sm text-bureau-fg">
                {r.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </span>
              <span className="text-right font-monod text-sm text-brass">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
