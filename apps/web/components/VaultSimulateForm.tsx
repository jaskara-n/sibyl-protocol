'use client';

import { useMemo, useState } from 'react';

/**
 * DISPLAY-AND-SIMULATE ONLY deposit/withdraw preview.
 *
 * This form mirrors the SibylVault ERC-4626 read surface
 * (convertToShares / convertToAssets / previewDeposit / previewRedeem — see
 * packages/sdk/src/sibylVault.ts) to show what a deposit or withdraw WOULD
 * yield at the current share price. It performs NO custody and NO broadcast:
 * there is no signer, no transaction, no fund movement. The submit is a
 * local testnet simulation only.
 *
 * Preview semantics (floor rounding, matching the on-chain ERC4626 base):
 *   deposit:  shares = assets / sharePrice               (previewDeposit / convertToShares)
 *   withdraw: shares = assets / sharePrice               (previewWithdraw)
 *   redeem:   assets = shares * sharePrice               (convertToAssets / previewRedeem)
 */
type Mode = 'deposit' | 'withdraw';

function floor(n: number, dp = 6): number {
  const f = 10 ** dp;
  return Math.floor(n * f) / f;
}

export function VaultSimulateForm({ sharePrice }: { sharePrice: number }) {
  const [mode, setMode] = useState<Mode>('deposit');
  const [amount, setAmount] = useState('1000');
  const [simulated, setSimulated] = useState(false);

  const assets = Number(amount);
  const validAmount = Number.isFinite(assets) && assets > 0;
  const price = sharePrice > 0 ? sharePrice : 1;

  const preview = useMemo(() => {
    if (!validAmount) return null;
    if (mode === 'deposit') {
      // previewDeposit / convertToShares: shares minted for `assets` (floor)
      const shares = floor(assets / price);
      return { sharesOut: shares, assetsOut: 0 };
    }
    // withdraw path: shares burned for `assets` (previewWithdraw), then the
    // assets they redeem back (previewRedeem / convertToAssets) for symmetry.
    const sharesIn = floor(assets / price);
    const assetsBack = floor(sharesIn * price);
    return { sharesOut: sharesIn, assetsOut: assetsBack };
  }, [assets, mode, price, validAmount]);

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-amber">deposit / withdraw</div>
        <span className="rounded-full border border-amber/40 bg-amber/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-amber">
          simulation only
        </span>
      </div>

      {/* Mode toggle */}
      <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-line bg-ink p-1">
        {(['deposit', 'withdraw'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setSimulated(false);
            }}
            className={`rounded-lg px-3 py-2 font-mono text-xs uppercase tracking-widest transition-colors ${
              mode === m ? 'bg-brand text-ink' : 'text-muted hover:text-fg'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Amount */}
      <label className="mt-4 block">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
          {mode === 'deposit' ? 'assets to deposit' : 'assets to withdraw'}
        </span>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setSimulated(false);
          }}
          className="mt-1.5 w-full rounded-xl border border-line bg-ink px-4 py-3 font-mono text-lg text-fg outline-none focus:border-brand/60"
          placeholder="0.0"
        />
      </label>

      {/* Preview (ERC-4626 reads) */}
      <div className="mt-4 space-y-2 rounded-xl border border-line bg-card/40 p-4">
        <PreviewRow
          label="share price"
          value={price.toLocaleString(undefined, { maximumFractionDigits: 6 })}
        />
        {mode === 'deposit' ? (
          <PreviewRow
            label="shares you'd receive"
            value={preview ? preview.sharesOut.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—'}
            accent="text-long"
            hint="previewDeposit"
          />
        ) : (
          <>
            <PreviewRow
              label="shares you'd redeem"
              value={preview ? preview.sharesOut.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—'}
              hint="previewWithdraw"
            />
            <PreviewRow
              label="assets you'd receive"
              value={preview ? preview.assetsOut.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—'}
              accent="text-long"
              hint="convertToAssets"
            />
          </>
        )}
      </div>

      {/* Simulated submit — never broadcasts */}
      <button
        type="button"
        disabled={!validAmount}
        onClick={() => setSimulated(true)}
        className="mt-4 w-full rounded-xl bg-linear-to-r from-brand to-cyan px-4 py-3 font-semibold text-ink transition-transform enabled:hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Simulate {mode} (testnet preview — no broadcast)
      </button>

      {simulated && validAmount && preview && (
        <div className="mt-3 rounded-xl border border-long/30 bg-long/5 p-3 font-mono text-xs text-long">
          ✓ Simulated. {mode === 'deposit'
            ? `${assets} assets → ${preview.sharesOut} shares.`
            : `${assets} assets → redeem ${preview.sharesOut} shares.`}{' '}
          No transaction was sent and no funds moved.
        </div>
      )}

      {/* Custody disclaimer */}
      <p className="mt-4 border-t border-line pt-3 font-mono text-[11px] leading-relaxed text-muted">
        Funds are <b className="text-fg">not custodied</b>. This panel reads the vault&apos;s ERC-4626 preview
        functions to estimate outcomes only — there is no connected wallet, no signer, and no on-chain
        transaction. Nothing here moves real assets on mainnet.
      </p>
    </div>
  );
}

function PreviewRow({
  label,
  value,
  accent,
  hint
}: {
  label: string;
  value: string;
  accent?: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">
        {label}
        {hint && <span className="ml-1.5 font-mono text-[10px] text-muted/60">{hint}()</span>}
      </span>
      <span className={`font-mono ${accent ?? 'text-fg'}`}>{value}</span>
    </div>
  );
}
