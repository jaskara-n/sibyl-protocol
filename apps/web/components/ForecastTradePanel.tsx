'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatUnits, parseUnits, type Address } from 'viem';
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
  OUTCOME,
  OUTCOME_FPMM_ABI,
  SIBYL_PREDICTION_MARKET_ABI,
  SIBYL_PREDICTION_MARKET_ADDRESS,
  SUSD_ADDRESS,
  SUSD_DECIMALS
} from '../lib/contracts';
import { mantleSepolia } from '../lib/wagmi';

/**
 * REAL on-chain trade panel for one binary prediction market on Mantle Sepolia
 * (chain id 5003). Mirrors the read/approve/write/wait pattern of VaultForm.
 *
 * Tabs:
 *   TRADE  — BUY YES / BUY NO: read calcBuyAmount() for the quote, apply a
 *            slippage tolerance to minOut, approve sUSD to the FPMM if needed,
 *            then fpmm.buy(outcome, collateralIn, minOut). SELL: approve the
 *            outcome token to the FPMM if needed, then fpmm.sell(outcome,
 *            collateralOut, maxIn) computed from calcSellAmount() + slippage.
 *   SET    — mintSet (deposit collateral -> YES+NO) / redeemSet (burn YES+NO ->
 *            collateral) on the SibylPredictionMarket.
 *   RESOLVE— resolver-only, after resolveTime: resolve(YES|NO|INVALID). After
 *            resolution anyone may redeem() winning shares.
 *
 * Reads refetch after every confirmed receipt (useWaitForTransactionReceipt).
 */

const DEC = SUSD_DECIMALS;
const EXPLORER = mantleSepolia.blockExplorers.default.url;
const SLIPPAGE_BPS = 100n; // 1% tolerance.
const BPS = 10000n;

type Tab = 'trade' | 'set' | 'resolve';
type Side = 'YES' | 'NO';

function fmt(v: bigint | undefined, maxFractionDigits = 4): string {
  if (v === undefined) return '—';
  const n = Number(formatUnits(v, DEC));
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
}

export function ForecastTradePanel({
  marketIdHex,
  fpmm,
  resolver,
  resolveTime,
  resolved
}: {
  marketIdHex: Address;
  /** FPMM pool address, or null when the market has no pool configured. */
  fpmm: Address | null;
  /** On-chain resolver, or null when unknown. */
  resolver: Address | null;
  /** Resolve time (unix seconds), or null when unknown. */
  resolveTime: number | null;
  /** Whether the market is already resolved. */
  resolved: boolean;
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const onCorrectChain = chainId === mantleSepolia.id;
  const readEnabled = Boolean(address) && onCorrectChain;

  const [tab, setTab] = useState<Tab>('trade');
  const [side, setSide] = useState<Side>('YES');
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('100');

  const outcomeCode = side === 'YES' ? OUTCOME.YES : OUTCOME.NO;

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

  // ---- Reads: balances + allowances ----
  const { data: susdBalance, refetch: refetchSusd } = useReadContract({
    address: SUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: readEnabled }
  });

  // sUSD allowance to the FPMM (BUY) and to the SibylPredictionMarket (mintSet).
  const { data: susdAllowanceFpmm, refetch: refetchSusdAllowFpmm } = useReadContract({
    address: SUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && fpmm ? [address, fpmm] : undefined,
    query: { enabled: readEnabled && Boolean(fpmm) }
  });

  const { data: susdAllowanceMarket, refetch: refetchSusdAllowMarket } = useReadContract({
    address: SUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, SIBYL_PREDICTION_MARKET_ADDRESS] : undefined,
    query: { enabled: readEnabled }
  });

  // Outcome token addresses from the FPMM.
  const { data: yesToken } = useReadContract({
    address: fpmm ?? undefined,
    abi: OUTCOME_FPMM_ABI,
    functionName: 'yes',
    query: { enabled: Boolean(fpmm) }
  });
  const { data: noToken } = useReadContract({
    address: fpmm ?? undefined,
    abi: OUTCOME_FPMM_ABI,
    functionName: 'no',
    query: { enabled: Boolean(fpmm) }
  });
  const activeToken = (side === 'YES' ? yesToken : noToken) as Address | undefined;

  const { data: yesBalance, refetch: refetchYes } = useReadContract({
    address: yesToken as Address | undefined,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: readEnabled && Boolean(yesToken) }
  });
  const { data: noBalance, refetch: refetchNo } = useReadContract({
    address: noToken as Address | undefined,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: readEnabled && Boolean(noToken) }
  });

  // Outcome-token allowance to the FPMM (needed before SELL).
  const { data: outcomeAllowance, refetch: refetchOutcomeAllow } = useReadContract({
    address: activeToken,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && fpmm ? [address, fpmm] : undefined,
    query: { enabled: readEnabled && Boolean(activeToken) && Boolean(fpmm) }
  });

  // ---- Quotes ----
  const { data: buyQuote } = useReadContract({
    address: fpmm ?? undefined,
    abi: OUTCOME_FPMM_ABI,
    functionName: 'calcBuyAmount',
    args: parsedAmount ? [outcomeCode, parsedAmount] : undefined,
    query: { enabled: Boolean(fpmm) && tab === 'trade' && tradeMode === 'buy' && validAmount }
  });

  const { data: sellQuote } = useReadContract({
    address: fpmm ?? undefined,
    abi: OUTCOME_FPMM_ABI,
    functionName: 'calcSellAmount',
    args: parsedAmount ? [outcomeCode, parsedAmount] : undefined,
    query: { enabled: Boolean(fpmm) && tab === 'trade' && tradeMode === 'sell' && validAmount }
  });

  // minOut for BUY: quote shaved by slippage. maxIn for SELL: quote padded.
  const minOut = useMemo(
    () => (buyQuote !== undefined ? (buyQuote * (BPS - SLIPPAGE_BPS)) / BPS : undefined),
    [buyQuote]
  );
  const maxIn = useMemo(
    () => (sellQuote !== undefined ? (sellQuote * (BPS + SLIPPAGE_BPS)) / BPS : undefined),
    [sellQuote]
  );

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

  function refreshAll() {
    void refetchSusd();
    void refetchSusdAllowFpmm();
    void refetchSusdAllowMarket();
    void refetchOutcomeAllow();
    void refetchYes();
    void refetchNo();
  }

  useEffect(() => {
    if (isConfirmed && txHash) refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash]);

  const busy = isSigning || isConfirming || switching;
  const txError = writeError ?? receiptError;

  // Approval gates.
  const needsSusdApprovalForBuy =
    tab === 'trade' &&
    tradeMode === 'buy' &&
    parsedAmount !== null &&
    susdAllowanceFpmm !== undefined &&
    (susdAllowanceFpmm as bigint) < parsedAmount;

  const needsOutcomeApprovalForSell =
    tab === 'trade' &&
    tradeMode === 'sell' &&
    maxIn !== undefined &&
    outcomeAllowance !== undefined &&
    (outcomeAllowance as bigint) < maxIn;

  const needsSusdApprovalForMint =
    tab === 'set' &&
    parsedAmount !== null &&
    susdAllowanceMarket !== undefined &&
    (susdAllowanceMarket as bigint) < parsedAmount;

  // ---- Write handlers ----
  function approveSusdToFpmm() {
    if (parsedAmount === null || !fpmm) return;
    resetWrite();
    writeContract({
      address: SUSD_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [fpmm, parsedAmount]
    });
  }

  function onBuy() {
    if (parsedAmount === null || !fpmm || minOut === undefined) return;
    resetWrite();
    writeContract({
      address: fpmm,
      abi: OUTCOME_FPMM_ABI,
      functionName: 'buy',
      args: [outcomeCode, parsedAmount, minOut]
    });
  }

  function approveOutcomeToFpmm() {
    if (!activeToken || !fpmm || maxIn === undefined) return;
    resetWrite();
    writeContract({
      address: activeToken,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [fpmm, maxIn]
    });
  }

  function onSell() {
    if (parsedAmount === null || !fpmm || maxIn === undefined) return;
    resetWrite();
    // sell(outcome, collateralOut, maxOutcomeIn) — amount is the collateral to receive.
    writeContract({
      address: fpmm,
      abi: OUTCOME_FPMM_ABI,
      functionName: 'sell',
      args: [outcomeCode, parsedAmount, maxIn]
    });
  }

  function approveSusdToMarket() {
    if (parsedAmount === null) return;
    resetWrite();
    writeContract({
      address: SUSD_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [SIBYL_PREDICTION_MARKET_ADDRESS, parsedAmount]
    });
  }

  function onMintSet() {
    if (parsedAmount === null) return;
    resetWrite();
    writeContract({
      address: SIBYL_PREDICTION_MARKET_ADDRESS,
      abi: SIBYL_PREDICTION_MARKET_ABI,
      functionName: 'mintSet',
      args: [marketIdHex, parsedAmount]
    });
  }

  function onRedeemSet() {
    if (parsedAmount === null) return;
    resetWrite();
    writeContract({
      address: SIBYL_PREDICTION_MARKET_ADDRESS,
      abi: SIBYL_PREDICTION_MARKET_ABI,
      functionName: 'redeemSet',
      args: [marketIdHex, parsedAmount]
    });
  }

  function onResolve(code: number) {
    resetWrite();
    writeContract({
      address: SIBYL_PREDICTION_MARKET_ADDRESS,
      abi: SIBYL_PREDICTION_MARKET_ABI,
      functionName: 'resolve',
      args: [marketIdHex, code]
    });
  }

  function onRedeemWinnings() {
    resetWrite();
    writeContract({
      address: SIBYL_PREDICTION_MARKET_ADDRESS,
      abi: SIBYL_PREDICTION_MARKET_ABI,
      functionName: 'redeem',
      args: [marketIdHex]
    });
  }

  // Resolver gating.
  const now = Math.floor(Date.now() / 1000);
  const isResolver =
    Boolean(address) &&
    Boolean(resolver) &&
    address?.toLowerCase() === resolver?.toLowerCase();
  const pastResolveTime = resolveTime !== null && now >= resolveTime;

  const noPool = !fpmm;

  return (
    <div className="glass w-full shrink-0 rounded-2xl p-6 lg:w-[420px]">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-brand">trade · positions</div>
        <span className="rounded-full border border-long/40 bg-long/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-long">
          live · mantle sepolia
        </span>
      </div>

      {/* Balances */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="sUSD" value={readEnabled ? fmt(susdBalance, 2) : '—'} accent="text-cyan" />
        <Stat label="YES shares" value={readEnabled ? fmt(yesBalance as bigint | undefined) : '—'} accent="text-long" />
        <Stat label="NO shares" value={readEnabled ? fmt(noBalance as bigint | undefined) : '—'} accent="text-short" />
      </div>

      {/* Tabs */}
      <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl border border-line bg-ink p-1">
        {(['trade', 'set', 'resolve'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              resetWrite();
            }}
            className={`rounded-lg px-3 py-2 font-mono text-xs uppercase tracking-widest transition-colors ${
              tab === t ? 'bg-brand text-ink' : 'text-muted hover:text-fg'
            }`}
          >
            {t === 'set' ? 'mint/redeem' : t}
          </button>
        ))}
      </div>

      {/* TRADE tab */}
      {tab === 'trade' && (
        <div className="mt-4">
          {noPool ? (
            <Notice>This market has no FPMM pool, so direct buy/sell is unavailable.</Notice>
          ) : resolved ? (
            <Notice>Market resolved — trading is closed. Redeem winnings under the Resolve tab.</Notice>
          ) : (
            <>
              {/* Side toggle */}
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-ink p-1">
                {(['YES', 'NO'] as Side[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setSide(s);
                      resetWrite();
                    }}
                    className={`rounded-lg px-3 py-2 font-mono text-xs font-semibold uppercase tracking-widest transition-colors ${
                      side === s
                        ? s === 'YES'
                          ? 'bg-long text-ink'
                          : 'bg-short text-ink'
                        : 'text-muted hover:text-fg'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Buy/Sell toggle */}
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl border border-line bg-ink p-1">
                {(['buy', 'sell'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setTradeMode(m);
                      resetWrite();
                    }}
                    className={`rounded-lg px-3 py-2 font-mono text-xs uppercase tracking-widest transition-colors ${
                      tradeMode === m ? 'bg-card text-fg' : 'text-muted hover:text-fg'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <label className="mt-4 block">
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
                  {tradeMode === 'buy'
                    ? `sUSD to spend on ${side}`
                    : `sUSD to receive for selling ${side}`}
                </span>
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    resetWrite();
                  }}
                  className="mt-1.5 w-full rounded-xl border border-line bg-ink px-4 py-3 font-mono text-lg text-fg outline-none focus:border-brand/60"
                  placeholder="0.0"
                />
              </label>

              <div className="mt-4 space-y-2 rounded-xl border border-line bg-card/40 p-4">
                {tradeMode === 'buy' ? (
                  <>
                    <PreviewRow label={`${side} shares (quote)`} value={fmt(buyQuote as bigint | undefined)} accent="text-long" hint="calcBuyAmount" />
                    <PreviewRow label="min received (1% slippage)" value={fmt(minOut)} />
                  </>
                ) : (
                  <>
                    <PreviewRow label={`${side} shares spent (quote)`} value={fmt(sellQuote as bigint | undefined)} accent="text-short" hint="calcSellAmount" />
                    <PreviewRow label="max spent (1% slippage)" value={fmt(maxIn)} />
                  </>
                )}
              </div>

              <ActionArea
                isConnected={isConnected}
                onCorrectChain={onCorrectChain}
                switching={switching}
                onSwitch={() => switchChain({ chainId: mantleSepolia.id })}
              >
                {tradeMode === 'buy' ? (
                  needsSusdApprovalForBuy ? (
                    <PrimaryButton disabled={!validAmount || busy} onClick={approveSusdToFpmm}>
                      {busy ? 'Approving sUSD…' : 'Approve sUSD'}
                    </PrimaryButton>
                  ) : (
                    <PrimaryButton disabled={!validAmount || busy || minOut === undefined} onClick={onBuy}>
                      {busy ? 'Buying…' : `Buy ${side}`}
                    </PrimaryButton>
                  )
                ) : needsOutcomeApprovalForSell ? (
                  <PrimaryButton disabled={!validAmount || busy || !activeToken} onClick={approveOutcomeToFpmm}>
                    {busy ? `Approving ${side}…` : `Approve ${side} shares`}
                  </PrimaryButton>
                ) : (
                  <PrimaryButton disabled={!validAmount || busy || maxIn === undefined} onClick={onSell}>
                    {busy ? 'Selling…' : `Sell ${side}`}
                  </PrimaryButton>
                )}
              </ActionArea>
            </>
          )}
        </div>
      )}

      {/* MINT / REDEEM SET tab */}
      {tab === 'set' && (
        <div className="mt-4">
          <p className="rounded-xl border border-line bg-card/40 p-3 font-mono text-[11px] leading-relaxed text-muted">
            A complete set is 1 YES + 1 NO per unit of collateral. <span className="text-fg">mintSet</span> locks
            sUSD to mint both; <span className="text-fg">redeemSet</span> burns equal YES+NO back into sUSD.
          </p>
          <label className="mt-4 block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted">complete-set amount (collateral units)</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                resetWrite();
              }}
              className="mt-1.5 w-full rounded-xl border border-line bg-ink px-4 py-3 font-mono text-lg text-fg outline-none focus:border-brand/60"
              placeholder="0.0"
            />
          </label>

          <ActionArea
            isConnected={isConnected}
            onCorrectChain={onCorrectChain}
            switching={switching}
            onSwitch={() => switchChain({ chainId: mantleSepolia.id })}
          >
            <div className="grid grid-cols-2 gap-2">
              {needsSusdApprovalForMint ? (
                <button
                  type="button"
                  disabled={!validAmount || busy}
                  onClick={approveSusdToMarket}
                  className="col-span-2 rounded-xl bg-linear-to-r from-brand to-cyan px-4 py-3 font-semibold text-ink transition-transform enabled:hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? 'Approving sUSD…' : 'Approve sUSD for mintSet'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!validAmount || busy}
                  onClick={onMintSet}
                  className="rounded-xl bg-long px-4 py-3 font-semibold text-ink transition-transform enabled:hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? 'Minting…' : 'Mint set'}
                </button>
              )}
              <button
                type="button"
                disabled={!validAmount || busy || needsSusdApprovalForMint}
                onClick={onRedeemSet}
                className="rounded-xl border border-line bg-card px-4 py-3 font-semibold text-fg transition-transform enabled:hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? 'Redeeming…' : 'Redeem set'}
              </button>
            </div>
          </ActionArea>
        </div>
      )}

      {/* RESOLVE tab */}
      {tab === 'resolve' && (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-line bg-card/40 p-4 font-mono text-[11px] leading-relaxed text-muted">
            <div className="flex items-center justify-between">
              <span>status</span>
              <span className={resolved ? 'text-long' : 'text-amber'}>
                {resolved ? 'resolved' : pastResolveTime ? 'awaiting resolution' : 'open'}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span>you are resolver</span>
              <span className={isResolver ? 'text-long' : 'text-muted'}>{isResolver ? 'yes' : 'no'}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span>resolve time reached</span>
              <span className={pastResolveTime ? 'text-long' : 'text-muted'}>{pastResolveTime ? 'yes' : 'no'}</span>
            </div>
          </div>

          <ActionArea
            isConnected={isConnected}
            onCorrectChain={onCorrectChain}
            switching={switching}
            onSwitch={() => switchChain({ chainId: mantleSepolia.id })}
          >
            <div className="space-y-3">
              {!resolved ? (
                isResolver && pastResolveTime ? (
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onResolve(OUTCOME.YES)}
                      className="rounded-xl bg-long px-3 py-3 font-semibold text-ink transition-transform enabled:hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      YES
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onResolve(OUTCOME.NO)}
                      className="rounded-xl bg-short px-3 py-3 font-semibold text-ink transition-transform enabled:hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      NO
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onResolve(OUTCOME.INVALID)}
                      className="rounded-xl border border-amber/50 bg-amber/10 px-3 py-3 font-semibold text-amber transition-transform enabled:hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      INVALID
                    </button>
                  </div>
                ) : (
                  <Notice>
                    {isResolver
                      ? 'Resolution opens once the resolve time is reached.'
                      : 'Only the market resolver can resolve this market.'}
                  </Notice>
                )
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onRedeemWinnings}
                  className="w-full rounded-xl bg-linear-to-r from-brand to-cyan px-4 py-3 font-semibold text-ink transition-transform enabled:hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? 'Redeeming…' : 'Redeem winnings'}
                </button>
              )}
            </div>
          </ActionArea>
        </div>
      )}

      {/* Tx status */}
      {txHash && (
        <div
          className={`mt-3 rounded-xl border p-3 font-mono text-xs ${
            isConfirmed ? 'border-long/30 bg-long/5 text-long' : 'border-cyan/30 bg-cyan/5 text-cyan'
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
        <div className="mt-3 rounded-xl border border-short/30 bg-short/5 p-3 font-mono text-xs text-short">
          {(txError as { shortMessage?: string }).shortMessage ?? txError.message}
        </div>
      )}

      <p className="mt-4 border-t border-line pt-3 font-mono text-[11px] leading-relaxed text-muted">
        Transactions are <b className="text-fg">real and signed by your wallet</b> on Mantle Sepolia (chain
        5003). Buys route through an sUSD <code className="text-fg/80">approve</code> to the pool, then
        <code className="text-fg/80"> buy(outcome, in, minOut)</code> at a 1% slippage floor; sells approve the
        outcome token then <code className="text-fg/80">sell(outcome, out, maxIn)</code>. Testnet assets only.
      </p>
    </div>
  );
}

function ActionArea({
  isConnected,
  onCorrectChain,
  switching,
  onSwitch,
  children
}: {
  isConnected: boolean;
  onCorrectChain: boolean;
  switching: boolean;
  onSwitch: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      {!isConnected ? (
        <div className="flex justify-center">
          <ConnectButton label="Connect wallet to transact" />
        </div>
      ) : !onCorrectChain ? (
        <button
          type="button"
          disabled={switching}
          onClick={onSwitch}
          className="w-full rounded-xl bg-amber px-4 py-3 font-semibold text-ink transition-transform enabled:hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {switching ? 'Switching…' : 'Switch to Mantle Sepolia (5003)'}
        </button>
      ) : (
        children
      )}
    </div>
  );
}

function PrimaryButton({
  disabled,
  onClick,
  children
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-xl bg-linear-to-r from-brand to-cyan px-4 py-3 font-semibold text-ink transition-transform enabled:hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card/40 p-4 text-center font-mono text-xs text-muted">
      {children}
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

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card/40 p-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-1 font-mono text-sm font-semibold ${accent ?? 'text-fg'}`}>{value}</div>
    </div>
  );
}
