import type { VaultPosition } from '../lib/api';

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Per-market vault positions (venue notional) from GET /vault/positions.
 * The bar encodes each position's share of total deployed capital.
 */
export function PositionTable({ positions }: { positions: VaultPosition[] }) {
  const rows = [...positions]
    .map((p) => ({ marketId: p.marketId, value: num(p.value) }))
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0);

  if (rows.length === 0) {
    return (
      <div className="glass rounded-2xl p-6 text-center text-muted">
        No open positions — the vault is holding idle cash.
      </div>
    );
  }

  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="grid grid-cols-[1fr_auto_64px] gap-3 border-b border-line px-5 py-3 font-mono text-[11px] uppercase tracking-widest text-muted">
        <span>market</span>
        <span className="text-right">value</span>
        <span className="text-right">share</span>
      </div>
      <ul>
        {rows.map((r) => {
          const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
          return (
            <li
              key={r.marketId}
              className="relative grid grid-cols-[1fr_auto_64px] items-center gap-3 border-b border-line/60 px-5 py-3.5 last:border-0"
            >
              <div
                className="pointer-events-none absolute inset-y-0 left-0 bg-brand/10"
                style={{ width: `${pct}%` }}
              />
              <span className="relative z-10 truncate font-mono text-sm text-fg">{r.marketId}</span>
              <span className="relative z-10 text-right font-mono text-sm text-fg">
                {r.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span className="relative z-10 text-right font-mono text-sm text-brand">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
