'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  decodeEventLog,
  keccak256,
  parseUnits,
  stringToHex,
  type Address,
  type Hex
} from 'viem';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract
} from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  ERC20_ABI,
  PREDICTION_FACTORY_ABI,
  PREDICTION_FACTORY_ADDRESS,
  SUSD_ADDRESS,
  SUSD_DECIMALS
} from '../../lib/contracts';
import { mantleSepolia } from '../../lib/wagmi';
import { short } from '../../lib/utils';
import { Reveal } from '../../components/landing/Reveal';

/**
 * REAL on-chain "Launch a prediction market" form on Mantle Sepolia (chain id
 * 5003). Mirrors the read/approve/write/wait pattern of VaultForm /
 * ForecastTradePanel.
 *
 * Submit flow:
 *   1. Derive marketId = keccak256(slug) and questionHash = keccak256(question).
 *      The connected wallet becomes the market resolver.
 *   2. If an initial liquidity (seedCollateral) > 0 is requested and the sUSD
 *      allowance to the PredictionFactory is insufficient, sUSD.approve(factory,
 *      seed) first.
 *   3. PredictionFactory.createAndSeed(marketId, sUSD, questionHash, resolveTime,
 *      resolver, seed).
 *   4. After the receipt, resolve the new FPMM (decoded from a factory log when
 *      available, otherwise read via fpmmOf(marketId)) and link to the market's
 *      /forecast/[marketId] page.
 */

const DEC = SUSD_DECIMALS;
const EXPLORER = mantleSepolia.blockExplorers.default.url;

/**
 * PredictionFactory `MarketLaunched` event — used to pull the new FPMM pool
 * address out of the createAndSeed receipt. Mirrors the contract exactly:
 * `MarketLaunched(bytes32 indexed marketId, address indexed fpmm, address
 * collateral, address indexed resolver, uint64 resolveTime, uint256
 * seedCollateral, address creator)`.
 */
const FACTORY_EVENT_ABI = [
  {
    type: 'event',
    name: 'MarketLaunched',
    inputs: [
      { name: 'marketId', type: 'bytes32', indexed: true },
      { name: 'fpmm', type: 'address', indexed: true },
      { name: 'collateral', type: 'address', indexed: false },
      { name: 'resolver', type: 'address', indexed: true },
      { name: 'resolveTime', type: 'uint64', indexed: false },
      { name: 'seedCollateral', type: 'uint256', indexed: false },
      { name: 'creator', type: 'address', indexed: false }
    ]
  }
] as const;

/** Slugify a question into a stable, lowercase, hyphenated key for the marketId hash. */
function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

/** Local-datetime-input string -> unix seconds (uint64). Empty/invalid -> null. */
function toUnix(local: string): number | null {
  if (!local) return null;
  const ms = new Date(local).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

function fmt(v: bigint | undefined, maxFractionDigits = 2): string {
  if (v === undefined) return '—';
  const n = Number(v) / 10 ** DEC;
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
}

export default function CreateMarketPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const publicClient = usePublicClient();

  const onCorrectChain = chainId === mantleSepolia.id;
  const readEnabled = Boolean(address) && onCorrectChain;

  const [question, setQuestion] = useState('');
  const [resolveLocal, setResolveLocal] = useState('');
  const [seed, setSeed] = useState('');

  // Two-phase write: optional approve, then createAndSeed.
  const [phase, setPhase] = useState<'idle' | 'approving' | 'creating'>('idle');
  const [newFpmm, setNewFpmm] = useState<Address | null>(null);

  // ---- Derived / validated inputs ----
  const trimmedQuestion = question.trim();

  const marketId = useMemo<Hex | null>(() => {
    if (!trimmedQuestion) return null;
    const slug = slugify(trimmedQuestion);
    if (!slug) return null;
    return keccak256(stringToHex(slug));
  }, [trimmedQuestion]);

  const questionHash = useMemo<Hex | null>(() => {
    if (!trimmedQuestion) return null;
    return keccak256(stringToHex(trimmedQuestion));
  }, [trimmedQuestion]);

  const resolveUnix = useMemo(() => toUnix(resolveLocal), [resolveLocal]);
  const nowUnix = Math.floor(Date.now() / 1000);
  const resolveInFuture = resolveUnix !== null && resolveUnix > nowUnix;

  // Optional seed; empty => 0 (no liquidity). Invalid (negative / non-numeric) => null.
  const parsedSeed = useMemo<bigint | null>(() => {
    const t = seed.trim();
    if (!t) return 0n;
    try {
      const v = parseUnits(t, DEC);
      return v >= 0n ? v : null;
    } catch {
      return null;
    }
  }, [seed]);
  const seedValid = parsedSeed !== null;
  const hasSeed = parsedSeed !== null && parsedSeed > 0n;

  // First validation error to show (cleared as the user fixes inputs).
  const validationError = useMemo<string | null>(() => {
    if (!trimmedQuestion) return 'Enter a question.';
    if (trimmedQuestion.length < 8) return 'Question is too short — be specific and verifiable.';
    if (!marketId) return 'Question must contain at least one letter or number.';
    if (!resolveLocal) return 'Pick a resolution date and time.';
    if (resolveUnix === null) return 'Resolution date/time is invalid.';
    if (!resolveInFuture) return 'Resolution time must be in the future.';
    if (!seedValid) return 'Initial liquidity is not a valid amount.';
    return null;
  }, [trimmedQuestion, marketId, resolveLocal, resolveUnix, resolveInFuture, seedValid]);

  const inputsValid = validationError === null;

  // ---- Reads ----
  const { data: susdBalance } = useReadContract({
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
    args: address ? [address, PREDICTION_FACTORY_ADDRESS] : undefined,
    query: { enabled: readEnabled }
  });

  // Guard: if a market with this id already exists, fpmmOf returns a non-zero address.
  const { data: existingFpmm } = useReadContract({
    address: PREDICTION_FACTORY_ADDRESS,
    abi: PREDICTION_FACTORY_ABI,
    functionName: 'fpmmOf',
    args: marketId ? [marketId] : undefined,
    query: { enabled: readEnabled && Boolean(marketId) }
  });
  const ZERO = '0x0000000000000000000000000000000000000000';
  const alreadyExists =
    typeof existingFpmm === 'string' && existingFpmm.toLowerCase() !== ZERO;

  const needsApproval =
    hasSeed &&
    parsedSeed !== null &&
    allowance !== undefined &&
    (allowance as bigint) < parsedSeed;

  // ---- Writes ----
  const {
    writeContract,
    data: txHash,
    isPending: isSigning,
    error: writeError,
    reset: resetWrite
  } = useWriteContract();

  const {
    data: receipt,
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError
  } = useWaitForTransactionReceipt({ hash: txHash });

  const busy = isSigning || isConfirming || switching;
  const txError = writeError ?? receiptError;

  function resetTx() {
    resetWrite();
    setPhase('idle');
    setNewFpmm(null);
  }

  function onApprove() {
    if (parsedSeed === null || parsedSeed <= 0n) return;
    resetWrite();
    setNewFpmm(null);
    setPhase('approving');
    writeContract(
      {
        address: SUSD_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [PREDICTION_FACTORY_ADDRESS, parsedSeed]
      },
      { onError: () => setPhase('idle') }
    );
  }

  function onCreate() {
    if (!inputsValid || marketId === null || questionHash === null || resolveUnix === null || !address)
      return;
    resetWrite();
    setNewFpmm(null);
    setPhase('creating');
    writeContract(
      {
        address: PREDICTION_FACTORY_ADDRESS,
        abi: PREDICTION_FACTORY_ABI,
        functionName: 'createAndSeed',
        args: [
          marketId,
          SUSD_ADDRESS,
          questionHash,
          BigInt(resolveUnix),
          address,
          parsedSeed ?? 0n
        ]
      },
      { onError: () => setPhase('idle') }
    );
  }

  // After a confirmed receipt: if it was the approval, refetch allowance so the
  // button advances to "Launch". If it was the create, resolve the new FPMM.
  useEffect(() => {
    if (!isConfirmed || !txHash) return;

    if (phase === 'approving') {
      void refetchAllowance();
      setPhase('idle');
      return;
    }

    // Create confirmed — resolve the FPMM, preferring the receipt log.
    let cancelled = false;
    async function resolveFpmm() {
      let found: Address | null = null;
      if (receipt) {
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== PREDICTION_FACTORY_ADDRESS.toLowerCase()) continue;
          try {
            const decoded = decodeEventLog({
              abi: FACTORY_EVENT_ABI,
              data: log.data,
              topics: log.topics
            });
            if (
              decoded.eventName === 'MarketLaunched' &&
              marketId &&
              (decoded.args.marketId as string).toLowerCase() === marketId.toLowerCase()
            ) {
              found = decoded.args.fpmm as Address;
              break;
            }
          } catch {
            // Not this event; skip.
          }
        }
      }
      // Fallback: read fpmmOf(marketId) from the factory.
      if (!found && publicClient && marketId) {
        try {
          const f = (await publicClient.readContract({
            address: PREDICTION_FACTORY_ADDRESS,
            abi: PREDICTION_FACTORY_ABI,
            functionName: 'fpmmOf',
            args: [marketId]
          })) as Address;
          if (f && f.toLowerCase() !== ZERO) found = f;
        } catch {
          // ignore — link still works via marketId.
        }
      }
      if (!cancelled) {
        setNewFpmm(found);
        setPhase('idle');
      }
    }
    void resolveFpmm();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash]);

  const forecastHref = marketId ? `/forecast/${encodeURIComponent(marketId)}` : '/forecast';

  return (
    <div className="relative z-0 bg-bureau text-bureau-fg">
      <div className="mx-auto max-w-3xl px-5 pb-24">
        {/* Header */}
        <header className="relative pt-12 pb-8">
          <p className="font-monod text-[11px] uppercase tracking-[0.42em] text-brass">Launch a market</p>
          <h1 className="mt-4 font-serifd text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02]">
            File a new <span className="italic text-brass">prediction market.</span>
          </h1>
          <p className="mt-5 max-w-2xl font-sansd text-base leading-relaxed text-bureau-muted">
            Permissionless and one transaction. Pose a verifiable yes/no question, set a resolution time,
            and optionally seed the pool with sUSD liquidity. You become the market&apos;s resolver.
          </p>
        </header>

        <div className="tick-scale" aria-hidden />

        {/* The filing — one bureau document */}
        <Reveal className="mt-10">
          <div className="bureau-frame p-6">
            <div className="bureau-grain" aria-hidden />

            <div className="flex items-baseline justify-between border-b border-bureau-line pb-3">
              <span className="font-monod text-[10px] uppercase tracking-[0.32em] text-bureau-muted">
                New market
              </span>
              <span className="border border-rise/50 px-2 py-0.5 font-monod text-[10px] uppercase tracking-[0.18em] text-rise">
                Live · Mantle Sepolia
              </span>
            </div>

            {/* Account stat */}
            <div className="mt-5 grid grid-cols-1 gap-3">
              <Stat label="sUSD balance" value={readEnabled ? fmt(susdBalance, 2) : '—'} accent="text-brass" />
            </div>

            {/* Question */}
            <label className="mt-5 block">
              <span className="font-monod text-[10px] uppercase tracking-[0.28em] text-bureau-muted">Question</span>
              <textarea
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  resetTx();
                }}
                rows={2}
                className="mt-2 w-full resize-none border border-bureau-line bg-bureau-panel px-4 py-3 font-monod text-base text-bureau-fg outline-none focus:border-brass"
                placeholder="Will MNT trade above $1.50 (USD) at 2026-09-01 00:00 UTC?"
              />
            </label>

            {/* Resolve time */}
            <label className="mt-5 block">
              <span className="font-monod text-[10px] uppercase tracking-[0.28em] text-bureau-muted">
                Resolution date &amp; time (your local timezone)
              </span>
              <input
                type="datetime-local"
                value={resolveLocal}
                onChange={(e) => {
                  setResolveLocal(e.target.value);
                  resetTx();
                }}
                className="mt-2 w-full border border-bureau-line bg-bureau-panel px-4 py-3 font-monod text-base text-bureau-fg outline-none focus:border-brass"
              />
            </label>

            {/* Seed */}
            <label className="mt-5 block">
              <span className="font-monod text-[10px] uppercase tracking-[0.28em] text-bureau-muted">
                Initial liquidity in sUSD (optional)
              </span>
              <input
                inputMode="decimal"
                value={seed}
                onChange={(e) => {
                  setSeed(e.target.value);
                  resetTx();
                }}
                className="mt-2 w-full border border-bureau-line bg-bureau-panel px-4 py-3 font-monod text-lg text-bureau-fg outline-none focus:border-brass"
                placeholder="0.0"
              />
            </label>

            {/* Derived preview — the filing record */}
            <div className="mt-5 border border-bureau-line bg-bureau-panel p-4">
              <PreviewRow label="marketId" value={marketId ? short(marketId, 10, 8) : '—'} hint="keccak256(slug)" />
              <PreviewRow label="questionHash" value={questionHash ? short(questionHash, 10, 8) : '—'} hint="keccak256(question)" />
              <PreviewRow
                label="resolver"
                value={address ? short(address) : 'connect wallet'}
                accent={address ? 'text-bureau-fg' : 'text-bureau-muted'}
              />
              <PreviewRow
                label="resolve time"
                value={resolveUnix !== null ? `${resolveUnix}` : '—'}
                hint="unix uint64"
              />
              <PreviewRow
                label="seed liquidity"
                value={hasSeed ? `${fmt(parsedSeed ?? 0n, 4)} sUSD` : 'none'}
                accent={hasSeed ? 'text-rise' : 'text-bureau-muted'}
              />
            </div>

            {/* Validation / existence notices */}
            {alreadyExists && (
              <div className="mt-3 border border-brass/50 p-3 font-monod text-xs text-brass">
                A market with this question already exists.{' '}
                <Link href={forecastHref} className="underline decoration-dotted hover:opacity-80">
                  View it →
                </Link>
              </div>
            )}
            {!alreadyExists && validationError && (trimmedQuestion || resolveLocal || seed) && (
              <div className="mt-3 border border-fall/40 p-3 font-monod text-xs text-fall">
                {validationError}
              </div>
            )}

            {/* Action area — gated on connect + chain */}
            <div className="mt-5">
              {!isConnected ? (
                <div className="flex justify-center">
                  <ConnectButton label="Connect wallet to launch" />
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
              ) : needsApproval ? (
                <button
                  type="button"
                  disabled={!inputsValid || alreadyExists || busy}
                  onClick={onApprove}
                  className="w-full bg-bureau-fg px-6 py-3 font-sansd text-sm font-semibold text-bureau transition-colors enabled:hover:bg-brass disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy && phase === 'approving' ? 'Approving sUSD…' : 'Approve sUSD liquidity'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!inputsValid || alreadyExists || busy}
                  onClick={onCreate}
                  className="w-full bg-bureau-fg px-6 py-3 font-sansd text-sm font-semibold text-bureau transition-colors enabled:hover:bg-brass disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy && phase === 'creating'
                    ? 'Launching market…'
                    : hasSeed
                      ? 'Launch market + seed liquidity'
                      : 'Launch market'}
                </button>
              )}
            </div>

            {/* Success — a brass-stamped certificate */}
            {isConfirmed && phase !== 'approving' && newFpmm !== null && (
              <div className="mt-4 border border-brass/60 p-5">
                <div className="flex items-baseline justify-between border-b border-bureau-line pb-3">
                  <span className="font-monod text-[10px] uppercase tracking-[0.32em] text-brass">
                    Market launched
                  </span>
                  <span className="rotate-[-4deg] border border-brass px-2 py-0.5 font-serifd text-sm text-brass">
                    Filed
                  </span>
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-6">
                  <span className="font-monod text-[10px] uppercase tracking-[0.28em] text-bureau-muted">
                    FPMM pool
                  </span>
                  <a
                    href={`${EXPLORER}/address/${newFpmm}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-monod text-sm text-brass underline decoration-dotted hover:opacity-80"
                  >
                    {short(newFpmm)} ↗
                  </a>
                </div>
                <Link
                  href={forecastHref}
                  className="mt-4 inline-block bg-bureau-fg px-6 py-2.5 font-sansd text-sm font-semibold text-bureau transition-colors hover:bg-brass"
                >
                  Go to your market →
                </Link>
              </div>
            )}

            {/* Tx submitted/confirming */}
            {txHash && !(isConfirmed && phase !== 'approving' && newFpmm !== null) && (
              <div
                className={`mt-3 border p-3 font-monod text-xs ${
                  isConfirmed ? 'border-rise/40 text-rise' : 'border-brass/40 text-brass'
                }`}
              >
                <div>
                  {isConfirming
                    ? 'Waiting for confirmation…'
                    : isConfirmed
                      ? phase === 'approving'
                        ? 'Approval confirmed — launch your market.'
                        : 'Confirmed — resolving pool…'
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
              <div className="mt-3 border border-fall/40 p-3 font-monod text-xs text-fall">
                {(txError as { shortMessage?: string }).shortMessage ?? txError.message}
              </div>
            )}

            {/* Disclaimer */}
            <p className="mt-5 border-t border-bureau-line pt-3 font-monod text-[11px] leading-relaxed text-bureau-muted">
              Transactions are <b className="text-bureau-fg">real and signed by your wallet</b> on Mantle Sepolia
              (chain 5003). The factory derives a fresh YES/NO market and FPMM pool from{' '}
              <code className="text-brass">createAndSeed(marketId, sUSD, questionHash, resolveTime, resolver, seed)</code>.
              Seeding routes through an sUSD <code className="text-brass">approve</code> first. You are set as the
              resolver and can settle the market after its resolve time. Testnet assets only.
            </p>
          </div>
        </Reveal>
      </div>
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
      <span className="font-monod text-[10px] uppercase tracking-[0.24em] text-bureau-muted">
        {label}
        {hint && <span className="ml-1.5 normal-case tracking-normal text-bureau-muted/60">{hint}</span>}
      </span>
      <span className={`font-monod ${accent ?? 'text-bureau-fg'}`}>{value}</span>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="border border-bureau-line bg-bureau-panel p-3">
      <div className="font-monod text-[10px] uppercase tracking-[0.24em] text-bureau-muted">{label}</div>
      <div className={`mt-1 font-monod text-sm font-medium ${accent ?? 'text-bureau-fg'}`}>{value}</div>
    </div>
  );
}
