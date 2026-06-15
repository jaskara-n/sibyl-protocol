'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract
} from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  ERC20_ABI,
  SIBYL_VAULT_ABI,
  SIBYL_VAULT_ADDRESS,
  SUSD_ADDRESS,
  SUSD_DECIMALS
} from '../lib/contracts';
import { mantleSepolia } from '../lib/wagmi';

/**
 * REAL on-chain deposit / withdraw against the SibylVault (ERC-4626) on
 * Mantle Sepolia (chain id 5003).
 *
 * Reads (wagmi useReadContract): sUSD balance + allowance, vault share balance,
 * and previewDeposit/previewRedeem for the live preview math.
 *
 * Writes (wagmi useWriteContract + useWaitForTransactionReceipt):
 *   DEPOSIT  — if allowance < amount, sUSD.approve(vault, amount) first, then
 *              SibylVault.deposit(assets, account).
 *   WITHDRAW — SibylVault.redeem(shares, account, account).
 *
 * Buttons are gated on a connected wallet and the correct chain; if the wallet
 * is on the wrong network the user is prompted to switch to 5003. No simulation
 * fallback — the submit is a real signed transaction.
 */
type Mode = 'deposit' | 'withdraw';

const DEC = SUSD_DECIMALS;
const EXPLORER = mantleSepolia.blockExplorers.default.url;

function fmt(v: bigint | undefined, maxFractionDigits = 6): string {
  if (v === undefined) return '—';
  const n = Number(formatUnits(v, DEC));
  return n.toLocaleString('en-US', { maximumFractionDigits: maxFractionDigits });
}

export function VaultForm({ sharePrice }: { sharePrice: number }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();

  const [mode, setMode] = useState<Mode>('deposit');
  const [amount, setAmount] = useState('1000');

  const onCorrectChain = chainId === mantleSepolia.id;

  // Parse the amount into base units; invalid input → null.
  const parsedAmount = useMemo<bigint | null>(() => {
    const trimmed = amount.trim();
    if (!trimmed) return null;
    try {
      const v = parseUnits(trimmed, DEC);
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  }, [amount]);
  const validAmount = parsedAmount !== null;

  // ---- Reads ----
  const readEnabled = Boolean(address) && onCorrectChain;

  const { data: susdBalance, refetch: refetchBalance } = useReadContract({
    address: SUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: readEnabled }
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: SUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, SIBYL_VAULT_ADDRESS] : undefined,
    query: { enabled: readEnabled }
  });

  const { data: shares, refetch: refetchShares } = useReadContract({
    address: SIBYL_VAULT_ADDRESS,
    abi: SIBYL_VAULT_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: readEnabled }
  });

  // Live preview from the vault itself (falls back to sharePrice math when reads
  // are unavailable, e.g. wallet not connected).
  const { data: previewDepositShares } = useReadContract({
    address: SIBYL_VAULT_ADDRESS,
    abi: SIBYL_VAULT_ABI,
    functionName: 'previewDeposit',
    args: parsedAmount ? [parsedAmount] : undefined,
    query: { enabled: readEnabled && mode === 'deposit' && validAmount }
  });

  const { data: previewRedeemAssets } = useReadContract({
    address: SIBYL_VAULT_ADDRESS,
    abi: SIBYL_VAULT_ABI,
    functionName: 'previewRedeem',
    args: parsedAmount ? [parsedAmount] : undefined,
    query: { enabled: readEnabled && mode === 'withdraw' && validAmount }
  });

  const price = sharePrice > 0 ? sharePrice : 1;

  // Fallback preview math (matches the on-chain floor rounding) when chain reads
  // are not yet available.
  const fallback = useMemo(() => {
    if (!validAmount || parsedAmount === null) return null;
    const n = Number(formatUnits(parsedAmount, DEC));
    if (mode === 'deposit') return n / price;
    return n * price;
  }, [validAmount, parsedAmount, mode, price]);

  const previewText = useMemo(() => {
    if (mode === 'deposit') {
      if (previewDepositShares !== undefined) return fmt(previewDepositShares);
    } else if (previewRedeemAssets !== undefined) {
      return fmt(previewRedeemAssets);
    }
    return fallback === null
      ? '—'
      : fallback.toLocaleString('en-US', { maximumFractionDigits: 6 });
  }, [mode, previewDepositShares, previewRedeemAssets, fallback]);

  // ---- Writes ----
  const {
    writeContract,
    data: txHash,
    isPending: isSigning,
    error: writeError,
    reset: resetWrite
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError
  } = useWaitForTransactionReceipt({ hash: txHash });

  // Whether the current deposit needs an approval first.
  const needsApproval =
    mode === 'deposit' &&
    parsedAmount !== null &&
    allowance !== undefined &&
    allowance < parsedAmount;

  const [phase, setPhase] = useState<'idle' | 'approving' | 'depositing'>('idle');

  function refreshAll() {
    void refetchBalance();
    void refetchAllowance();
    void refetchShares();
  }

  function onApprove() {
    if (parsedAmount === null) return;
    resetWrite();
    setPhase('approving');
    writeContract(
      {
        address: SUSD_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        // Approve exact amount requested. (maxUint256 available if infinite is desired.)
        args: [SIBYL_VAULT_ADDRESS, parsedAmount]
      },
      { onError: () => setPhase('idle') }
    );
  }

  function onDeposit() {
    if (parsedAmount === null || !address) return;
    resetWrite();
    setPhase('depositing');
    writeContract(
      {
        address: SIBYL_VAULT_ADDRESS,
        abi: SIBYL_VAULT_ABI,
        functionName: 'deposit',
        args: [parsedAmount, address]
      },
      { onError: () => setPhase('idle') }
    );
  }

  function onWithdraw() {
    if (parsedAmount === null || !address) return;
    resetWrite();
    setPhase('idle');
    // redeem(shares, receiver, owner) — `amount` here is interpreted as shares.
    writeContract({
      address: SIBYL_VAULT_ADDRESS,
      abi: SIBYL_VAULT_ABI,
      functionName: 'redeem',
      args: [parsedAmount, address, address]
    });
  }

  // After a confirmed receipt, refresh balances. If the confirmed tx was an
  // approval for a deposit, the allowance refetch flips `needsApproval` off so
  // the button advances to the deposit step.
  useEffect(() => {
    if (isConfirmed && txHash) {
      refreshAll();
      setPhase('idle');
    }
    // refreshAll is stable enough for this effect; keyed on the confirmed hash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash]);

  const busy = isSigning || isConfirming || switching;
  const txError = writeError ?? receiptError;

  return (
    <div className="bureau-frame p-6">
      <div className="bureau-grain" aria-hidden />

      <div className="flex items-baseline justify-between border-b border-bureau-line pb-3">
        <span className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
          Deposit / withdraw
        </span>
        <span className="border border-rise/50 px-2 py-0.5 font-monod text-[11px] uppercase tracking-[0.18em] text-rise">
          Live · Mantle Sepolia
        </span>
      </div>

      {/* Account balances */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Stat label="sUSD balance" value={readEnabled ? fmt(susdBalance, 2) : '—'} accent="text-brass" />
        <Stat label="Your shares" value={readEnabled ? fmt(shares, 6) : '—'} accent="text-bureau-fg" />
      </div>

      {/* Mode toggle */}
      <div className="mt-5 grid grid-cols-2 border border-bureau-line">
        {(['deposit', 'withdraw'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              resetWrite();
              setPhase('idle');
            }}
            className={`px-3 py-2.5 font-monod text-[11px] uppercase tracking-[0.2em] transition-colors first:border-r first:border-bureau-line ${
              mode === m ? 'bg-bureau-fg text-bureau' : 'text-bureau-muted hover:text-brass'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Amount */}
      <label className="mt-5 block">
        <span className="font-monod text-[11px] uppercase tracking-[0.18em] text-bureau-muted">
          {mode === 'deposit' ? 'sUSD assets to deposit' : 'shares to redeem'}
        </span>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            resetWrite();
            setPhase('idle');
          }}
          className="mt-2 w-full border border-bureau-line bg-bureau-panel px-4 py-3 font-monod text-lg text-bureau-fg outline-none focus:border-brass"
          placeholder="0.0"
        />
      </label>

      {/* Preview */}
      <div className="mt-5 border border-bureau-line bg-bureau-panel p-4">
        <PreviewRow
          label="Share price"
          value={price.toLocaleString('en-US', { maximumFractionDigits: 6 })}
        />
        {mode === 'deposit' ? (
          <PreviewRow
            label="Shares you'd receive"
            value={previewText}
            accent="text-rise"
          />
        ) : (
          <PreviewRow
            label="Assets you'd receive"
            value={previewText}
            accent="text-rise"
          />
        )}
      </div>

      {/* Action area — gated on connect + chain */}
      <div className="mt-5">
        {!isConnected ? (
          <div className="flex justify-center">
            <ConnectButton label="Connect wallet to transact" />
          </div>
        ) : !onCorrectChain ? (
          <button
            type="button"
            disabled={switching}
            onClick={() => switchChain({ chainId: mantleSepolia.id })}
            className="w-full border border-bureau-line px-6 py-3 font-sansd text-sm font-semibold text-bureau-fg transition-colors enabled:hover:border-brass enabled:hover:text-brass disabled:cursor-not-allowed disabled:opacity-50"
          >
            {switching ? 'Switching…' : 'Switch to Mantle Sepolia (5003)'}
          </button>
        ) : mode === 'deposit' && needsApproval ? (
          <button
            type="button"
            disabled={!validAmount || busy}
            onClick={onApprove}
            className="w-full bg-bureau-fg px-6 py-3 font-sansd text-sm font-semibold text-bureau transition-colors enabled:hover:bg-brass disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && phase === 'approving' ? 'Approving sUSD…' : 'Approve sUSD'}
          </button>
        ) : mode === 'deposit' ? (
          <button
            type="button"
            disabled={!validAmount || busy}
            onClick={onDeposit}
            className="w-full bg-bureau-fg px-6 py-3 font-sansd text-sm font-semibold text-bureau transition-colors enabled:hover:bg-brass disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Depositing…' : 'Deposit'}
          </button>
        ) : (
          <button
            type="button"
            disabled={!validAmount || busy}
            onClick={onWithdraw}
            className="w-full bg-bureau-fg px-6 py-3 font-sansd text-sm font-semibold text-bureau transition-colors enabled:hover:bg-brass disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Redeeming…' : 'Redeem shares'}
          </button>
        )}
      </div>

      {/* Tx status */}
      {txHash && (
        <div
          className={`mt-3 border p-3 font-monod text-xs ${
            isConfirmed ? 'border-rise/40 text-rise' : 'border-brass/40 text-brass'
          }`}
        >
          <div>{isConfirming ? 'Waiting for confirmation…' : isConfirmed ? 'Confirmed.' : 'Submitted.'}</div>
          <a
            href={`${EXPLORER}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block break-all underline decoration-dotted hover:opacity-80"
          >
            {txHash}
          </a>
        </div>
      )}

      {txError && (
        <div className="mt-3 border border-fall/40 p-3 font-monod text-xs text-fall">
          {(txError as { shortMessage?: string }).shortMessage ?? txError.message}
        </div>
      )}

      {/* Disclaimer */}
      <p className="mt-5 border-t border-bureau-line pt-3 font-monod text-[11px] leading-relaxed text-bureau-muted">
        Transactions are <b className="text-bureau-fg">real and signed by your wallet</b> on Mantle Sepolia.
        Your first deposit may ask for a one-time approval to spend sUSD, then the deposit confirms; withdrawing
        returns your assets to your wallet. Testnet assets only.
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
    <div className="flex items-baseline justify-between gap-6 py-1.5 text-sm">
      <span className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">
        {label}
        {hint && <span className="ml-1.5 normal-case tracking-normal text-bureau-muted/60">{hint}()</span>}
      </span>
      <span className={`font-monod ${accent ?? 'text-bureau-fg'}`}>{value}</span>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="border border-bureau-line bg-bureau-panel p-3">
      <div className="font-monod text-[11px] uppercase tracking-[0.2em] text-bureau-muted">{label}</div>
      <div className={`mt-1 font-monod text-sm font-medium ${accent ?? 'text-bureau-fg'}`}>{value}</div>
    </div>
  );
}
