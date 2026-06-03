'use client';

import { useState } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { mantleSepolia } from '../lib/wagmi';

/**
 * Shared chain-state hook. Lets the global ChainGuard banner and the existing
 * transaction forms (VaultForm, ForecastTradePanel, /create) reason about the
 * same network gate without duplicating wagmi wiring.
 *
 *   isConnected   — a wallet is connected.
 *   onCorrectChain — connected AND on Mantle Sepolia (chain id 5003).
 *   switching     — a switchChain request is in flight (pending).
 *   promptSwitch  — call to request a switch to Mantle Sepolia; if the wallet
 *                   does not have the chain, the connector will prompt to add it.
 */
export function useOnSibylChain() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching, error } = useSwitchChain();

  const onCorrectChain = isConnected && chainId === mantleSepolia.id;

  // If the wallet lacks the chain, switchChain prompts the connector to add it.
  const promptSwitch = () => switchChain({ chainId: mantleSepolia.id });

  return { isConnected, onCorrectChain, switching, promptSwitch, error };
}

/**
 * Global wrong-network guard.
 *
 * When a wallet is connected but sitting on a chain other than Mantle Sepolia
 * (5003), renders a sticky, dismissible top banner in the cosmic-neon style
 * prompting a one-click switch. Renders nothing when disconnected or already on
 * the correct chain.
 *
 * SSR-safe: client component with no window/document access at module scope —
 * dismissal lives in React state, and wagmi reports a stable (disconnected)
 * state during hydration, so the server and first client render agree (null).
 */
export function ChainGuard() {
  const { isConnected, onCorrectChain, switching, promptSwitch, error } = useOnSibylChain();
  const [dismissed, setDismissed] = useState(false);

  // Connected & correct, or disconnected → nothing to guard.
  if (!isConnected || onCorrectChain || dismissed) return null;

  const errorMessage = error
    ? (error as { shortMessage?: string }).shortMessage ?? error.message
    : null;

  return (
    <div className="sticky top-0 z-[60] w-full" role="region" aria-label="Network warning">
      <div className="glass border-b border-amber/40 bg-amber/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-amber/50 bg-amber/10 font-mono text-sm text-amber"
            >
              !
            </span>
            <p role="alert" className="text-sm leading-relaxed text-fg">
              <span className="font-semibold text-amber">Wrong network.</span>{' '}
              You&rsquo;re connected to the wrong network — Sibyl runs on{' '}
              <span className="font-semibold">Mantle Sepolia</span> (chain 5003).
              {errorMessage && (
                <span className="mt-1 block font-mono text-[11px] text-short">{errorMessage}</span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={switching}
              onClick={() => promptSwitch()}
              className="rounded-xl bg-amber px-4 py-2 text-sm font-semibold text-ink transition-transform enabled:hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {switching ? 'Switching…' : 'Switch to Mantle Sepolia'}
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss network warning"
              className="grid h-9 w-9 place-items-center rounded-xl border border-line text-muted transition-colors hover:text-fg"
            >
              <span aria-hidden className="text-lg leading-none">×</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
