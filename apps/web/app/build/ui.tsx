'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract
} from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ERC8004_IDENTITY_ABI, ERC8004_IDENTITY_ADDRESS } from '../../lib/contracts';
import { mantleSepolia } from '../../lib/wagmi';

/** Single entrance reveal (server children allowed). */
export function BuildReveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: 'easeOut', delay }}
    >
      {children}
    </motion.div>
  );
}

/** Staggered grid: each direct child fades+rises in sequence. */
export function StaggerList({ children, className }: { children: ReactNode; className?: string }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
      variants={{ show: { transition: { staggerChildren: 0.08 } } }}
    >
      {items.map((child, i) => (
        <motion.div
          key={i}
          variants={{
            hidden: { opacity: 0, y: 18 },
            show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } }
          }}
          className="h-full"
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

/** macOS-style terminal frame with lightweight token coloring. */
export function CodeTerminal({ title, code }: { title: string; code: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="glass overflow-hidden rounded-2xl"
    >
      <div className="flex items-center gap-2 border-b border-line bg-ink/60 px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-short/80" />
        <span className="h-3 w-3 rounded-full bg-amber/80" />
        <span className="h-3 w-3 rounded-full bg-long/80" />
        <span className="ml-3 font-mono text-xs text-muted">{title}</span>
        <span className="ml-auto font-mono text-[11px] text-muted/70">@sibyl/agent-sdk</span>
      </div>
      <pre className="overflow-x-auto bg-ink p-5 font-mono text-[12.5px] leading-relaxed">
        <code>{highlight(code)}</code>
      </pre>
    </motion.div>
  );
}

function highlight(code: string): ReactNode {
  const KEYWORDS = new Set([
    'import',
    'from',
    'export',
    'default',
    'async',
    'const',
    'return',
    'await',
    'let'
  ]);
  return code.split('\n').map((line, li) => {
    // comments
    if (line.trimStart().startsWith('#') || line.trimStart().startsWith('//')) {
      return (
        <span key={li} className="text-muted/60">
          {line}
          {'\n'}
        </span>
      );
    }
    // shell prompt lines
    if (line.trimStart().startsWith('$')) {
      const idx = line.indexOf('$');
      const inlineComment = line.indexOf('#', idx + 1);
      const cmd = inlineComment === -1 ? line.slice(idx) : line.slice(idx, inlineComment);
      const rest = inlineComment === -1 ? '' : line.slice(inlineComment);
      return (
        <span key={li}>
          <span className="text-brand">{line.slice(0, idx)}$ </span>
          <span className="text-long">{cmd.replace(/^\$\s*/, '')}</span>
          {rest && <span className="text-muted/60">{rest}</span>}
          {'\n'}
        </span>
      );
    }
    const tokens = line.split(/(\s+|[(){}.,;])/);
    return (
      <span key={li}>
        {tokens.map((tok, ti) => {
          if (KEYWORDS.has(tok)) return <span key={ti} className="text-brand">{tok}</span>;
          if (/^"[^"]*"$/.test(tok)) return <span key={ti} className="text-long">{tok}</span>;
          if (/^(LONG|SHORT|FLAT)$/.test(tok)) return <span key={ti} className="text-cyan">{tok}</span>;
          if (/^(predict|defineAgent|runRounds|tanh|at)$/.test(tok)) return <span key={ti} className="text-cyan">{tok}</span>;
          if (/^[0-9.]+$/.test(tok)) return <span key={ti} className="text-amber">{tok}</span>;
          return <span key={ti} className="text-fg/90">{tok}</span>;
        })}
        {'\n'}
      </span>
    );
  });
}

const EXPLORER = mantleSepolia.blockExplorers.default.url;

/**
 * REAL ERC-8004 agent self-registration against the IdentityRegistry on Mantle
 * Sepolia (chain id 5003). Mirrors VaultForm's wallet flow.
 *
 * Read: `balanceOf(connected wallet)` — when > 0 the wallet already owns an
 * identity NFT, so we show an "already registered" state instead of the mint
 * button. Write: `register(agentURI)` mints a new ERC-721 identity NFT to the
 * caller (permissionless — verified on-chain), then `useWaitForTransactionReceipt`
 * tracks confirmation with an explorer link.
 */
export function ConnectWalletCTA() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();

  const onCorrectChain = chainId === mantleSepolia.id;
  const readEnabled = Boolean(address) && onCorrectChain;

  // Default agent URI keyed on the connected wallet (informational metadata only;
  // the registry mints the NFT to msg.sender regardless of URI contents).
  const agentURI = useMemo(
    () => (address ? `sibyl://agent/${address.toLowerCase()}` : 'sibyl://agent'),
    [address]
  );

  // Detect "already registered": the standard ERC-721 ownership count.
  const { data: identityCount, refetch: refetchCount } = useReadContract({
    address: ERC8004_IDENTITY_ADDRESS,
    abi: ERC8004_IDENTITY_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: readEnabled }
  });
  const alreadyRegistered = (identityCount ?? 0n) > 0n;

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

  // Refresh the ownership read once the mint confirms so the UI flips to the
  // "already registered" state.
  useEffect(() => {
    if (isConfirmed) void refetchCount();
    // refetchCount is stable; keyed on the confirmed hash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash]);

  function onRegister() {
    if (!address) return;
    resetWrite();
    writeContract({
      address: ERC8004_IDENTITY_ADDRESS,
      abi: ERC8004_IDENTITY_ABI,
      functionName: 'register',
      args: [agentURI]
    });
  }

  const busy = isSigning || isConfirming;
  const txError = writeError ?? receiptError;

  return (
    <div className="mt-5">
      {!isConnected ? (
        <div className="flex justify-center">
          <ConnectButton label="Connect wallet to register" />
        </div>
      ) : !onCorrectChain ? (
        <button
          type="button"
          disabled={switching}
          onClick={() => switchChain({ chainId: mantleSepolia.id })}
          className="w-full rounded-xl bg-amber px-5 py-3 font-display font-semibold text-ink transition-transform enabled:hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {switching ? 'Switching…' : 'Switch to Mantle Sepolia (5003)'}
        </button>
      ) : alreadyRegistered ? (
        <div className="rounded-xl border border-long/30 bg-long/5 p-3 text-center">
          <div className="font-display font-semibold text-long">Identity registered ✓</div>
          <a
            href={`${EXPLORER}/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block break-all font-mono text-[11px] text-long underline decoration-dotted hover:opacity-80"
          >
            {address}
          </a>
          <p className="mt-1.5 font-mono text-[10px] text-muted">
            this wallet owns {identityCount?.toString() ?? '1'} ERC-8004 identity NFT
            {(identityCount ?? 0n) > 1n ? 's' : ''}
          </p>
        </div>
      ) : (
        <motion.button
          type="button"
          onClick={onRegister}
          disabled={busy}
          whileHover={busy ? undefined : { scale: 1.03 }}
          whileTap={busy ? undefined : { scale: 0.97 }}
          className="w-full rounded-xl bg-linear-to-r from-brand to-cyan px-5 py-3 text-center font-display font-semibold text-ink glow-brand transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSigning
            ? 'Confirm in wallet…'
            : isConfirming
              ? 'Minting identity…'
              : 'Register agent identity →'}
        </motion.button>
      )}

      {txHash && (
        <div
          className={`mt-3 rounded-xl border p-3 font-mono text-xs ${
            isConfirmed ? 'border-long/30 bg-long/5 text-long' : 'border-cyan/30 bg-cyan/5 text-cyan'
          }`}
        >
          <div>
            {isConfirming
              ? 'Waiting for confirmation…'
              : isConfirmed
                ? 'Identity minted.'
                : 'Submitted.'}
          </div>
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
        <div className="mt-3 rounded-xl border border-short/30 bg-short/5 p-3 font-mono text-xs text-short">
          {(txError as { shortMessage?: string }).shortMessage ?? txError.message}
        </div>
      )}

      {isConnected && onCorrectChain && !alreadyRegistered && !txHash && (
        <p className="mt-2.5 text-center font-mono text-[11px] text-muted">
          mints a real ERC-8004 identity NFT to your wallet on Mantle Sepolia (5003)
        </p>
      )}
    </div>
  );
}
