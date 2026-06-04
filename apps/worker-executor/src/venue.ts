import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  parseUnits,
  formatUnits,
  encodeFunctionData,
  type Hex,
  type Address
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mantleSepoliaTestnet } from 'viem/chains';

/// A consensus decision turned into an executable order.
export interface ExecutionOrder {
  id: string;
  /// Off-chain market identifier (e.g. "MNT-USD"). Carried end-to-end so venues stay multi-market.
  marketId: string;
  timestamp: number;
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'FLAT';
  sizeBps: number;
  confidence: number;
  contributors: string[];
}

export interface ExecutionReceipt {
  venue: string;
  /// Echoes the order's market so callers can correlate receipts per market.
  marketId: string;
  status: 'filled' | 'skipped' | 'failed';
  ref: string;
  detail?: string;
}

/// Pluggable execution venue. Lets the consensus engine stay venue-agnostic so we can swap
/// the paper venue for a real spot-DEX adapter (Byreal/RealClaw) without touching the core loop.
export interface IExecutionVenue {
  readonly name: string;
  execute(order: ExecutionOrder): Promise<ExecutionReceipt>;
}

const ARTIFACT_DIR = resolve(process.cwd(), '../../data/artifacts');

/// Max paper trade-events retained PER MARKET (bounded so the feed never grows without limit
/// in a multi-market loop). The file holds at most MAX_EVENTS_PER_MARKET * (#markets) entries.
const MAX_EVENTS_PER_MARKET = 100;

type PaperTradeEvent = ExecutionOrder & { mode: 'paper' };

/// Default venue: records a bounded, market-tagged paper trade to the artifacts feed.
/// No real funds, no leverage, no broadcast.
export class PaperVenue implements IExecutionVenue {
  readonly name = 'paper';

  async execute(order: ExecutionOrder): Promise<ExecutionReceipt> {
    if (order.direction === 'FLAT' || order.sizeBps === 0) {
      return {
        venue: this.name,
        marketId: order.marketId,
        status: 'skipped',
        ref: order.id,
        detail: 'no edge (FLAT / zero size)'
      };
    }
    const tradesPath = resolve(ARTIFACT_DIR, 'trade-events.json');
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    const existing: PaperTradeEvent[] = existsSync(tradesPath)
      ? (JSON.parse(readFileSync(tradesPath, 'utf8')) as PaperTradeEvent[])
      : [];

    const event: PaperTradeEvent = { ...order, mode: 'paper' };
    existing.unshift(event);

    // Bound the feed per market so one market can't starve the others out of the window.
    const perMarketCount = new Map<string, number>();
    const bounded: PaperTradeEvent[] = [];
    for (const e of existing) {
      const key = e.marketId ?? e.symbol;
      const seen = perMarketCount.get(key) ?? 0;
      if (seen >= MAX_EVENTS_PER_MARKET) continue;
      perMarketCount.set(key, seen + 1);
      bounded.push(e);
    }

    writeFileSync(tradesPath, JSON.stringify(bounded, null, 2));
    return { venue: this.name, marketId: order.marketId, status: 'filled', ref: order.id };
  }
}

/// Spot-DEX execution via Byreal Skills CLI / RealClaw on Mantle (Merchant Moe / Agni / Fluxion).
/// Verified scope: SPOT only — derivatives live off-chain on Bybit's API and are out of the core loop.
/// The RealClaw API/CLI spec is gated behind hackathon docs; the real call is wired here once available.
export class ByrealSpotVenue implements IExecutionVenue {
  readonly name = 'byreal-spot';

  constructor(private readonly endpoint?: string) {}

  async execute(order: ExecutionOrder): Promise<ExecutionReceipt> {
    if (!this.endpoint) {
      return {
        venue: this.name,
        marketId: order.marketId,
        status: 'skipped',
        ref: order.id,
        detail: 'BYREAL_ENDPOINT not set — RealClaw spot adapter pending the Byreal Skills CLI spec'
      };
    }
    // TODO(byreal): POST a bounded spot order to the RealClaw endpoint. Spot only; never leverage.
    throw new Error('ByrealSpotVenue.execute not implemented: awaiting Byreal Skills CLI / RealClaw API spec');
  }
}

// ---------------------------------------------------------------------------
// Real Mantle spot-DEX venue (Agni / Merchant Moe v3 — UniswapV3-style router).
// SPOT ONLY: a single exactInputSingle swap, never leverage, never derivatives.
// ---------------------------------------------------------------------------

/// Minimal ERC-20 surface we need: read decimals/balance, check + grant allowance.
const ERC20_ABI = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ type: 'bool' }]
  }
] as const;

/// UniswapV3-style exactInputSingle. Agni and Merchant Moe v3 routers share this signature
/// (a single struct param). Verify the deployed router exposes exactly this before broadcasting.
const SWAP_ROUTER_ABI = [
  {
    type: 'function',
    name: 'exactInputSingle',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' }
        ]
      }
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }]
  }
] as const;

interface MantleSpotConfig {
  router: Address;
  tokenIn: Address;
  tokenOut: Address;
  poolFee: number;
  privateKey: Hex;
  rpcUrl?: string;
  /// Total spot inventory (human units of tokenIn) that sizeBps is taken against.
  notionalBudget: number;
  /// Slippage tolerance in bps applied to a caller-supplied quote (default 50 = 0.5%).
  slippageBps: number;
  /// Seconds the swap stays valid for (default 120s).
  deadlineSeconds: number;
  /// Caller-supplied quote: expected tokenOut (human units) for the FULL budget. Required to set
  /// a non-zero amountOutMinimum (slippage guard); without it the venue refuses to swap.
  expectedOutFull?: number;
}

/// Normalize a marketId (e.g. "MNT-USD") into an env-key-safe suffix (e.g. "MNT_USD"):
/// uppercase, non-alphanumerics -> underscore. Used to key per-market venue env vars.
function marketEnvKey(marketId: string): string {
  return marketId.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

/// Per-market env lookup: prefers the market-scoped key (e.g. `MANTLE_PAIR_MNT_USD`) and falls
/// back to a global key for fields that are not naturally per-market (router / key / RPC).
function marketEnv(marketId: string, suffix: string, globalKey?: string): string | undefined {
  const scoped = process.env[`MANTLE_${suffix}_${marketEnvKey(marketId)}`];
  if (scoped !== undefined) return scoped;
  return globalKey ? process.env[globalKey] : undefined;
}

/// Pull per-market config from env. Returns missing-field list (clean skip) if any required
/// field is absent, mirroring the paper/Byreal fallthrough so the worker never crashes.
///
/// Per-market token pair + budget are keyed by marketId:
///   MANTLE_PAIR_<MARKETID>            = "<tokenIn>,<tokenOut>[,<poolFee>]"   (e.g. MANTLE_PAIR_MNT_USD)
///   MANTLE_BUDGET_<MARKETID>          = notional budget (human units of tokenIn)
///   MANTLE_EXPECTED_OUT_<MARKETID>    = quoted tokenOut for the full budget (slippage guard)
/// Router / private key / RPC / slippage / deadline fall back to the global keys.
function loadMantleConfig(marketId: string): { config?: MantleSpotConfig; missing: string[] } {
  const missing: string[] = [];

  const router = marketEnv(marketId, 'DEX_ROUTER', 'MANTLE_DEX_ROUTER');
  const privateKey = process.env.PRIVATE_KEY;

  // Per-market token pair: "tokenIn,tokenOut[,poolFee]" via MANTLE_PAIR_<MARKETID>,
  // or legacy global IN_TOKEN / OUT_TOKEN.
  const pairRaw = process.env[`MANTLE_PAIR_${marketEnvKey(marketId)}`];
  let tokenIn: string | undefined;
  let tokenOut: string | undefined;
  let pairPoolFee: string | undefined;
  if (pairRaw) {
    const [a, b, fee] = pairRaw.split(',').map((s) => s.trim());
    tokenIn = a;
    tokenOut = b;
    pairPoolFee = fee;
  } else {
    tokenIn = process.env.IN_TOKEN;
    tokenOut = process.env.OUT_TOKEN;
  }

  const budgetRaw = marketEnv(marketId, 'BUDGET', 'MANTLE_NOTIONAL_BUDGET');

  if (!router) missing.push('MANTLE_DEX_ROUTER');
  if (!tokenIn) missing.push(`MANTLE_PAIR_${marketEnvKey(marketId)} (tokenIn) or IN_TOKEN`);
  if (!tokenOut) missing.push(`MANTLE_PAIR_${marketEnvKey(marketId)} (tokenOut) or OUT_TOKEN`);
  if (!privateKey) missing.push('PRIVATE_KEY');
  if (!budgetRaw) missing.push(`MANTLE_BUDGET_${marketEnvKey(marketId)} or MANTLE_NOTIONAL_BUDGET`);
  if (missing.length > 0) return { missing };

  const budget = Number(budgetRaw);
  if (!Number.isFinite(budget) || budget <= 0) {
    return { missing: [`MANTLE_BUDGET_${marketEnvKey(marketId)} (must be a positive number)`] };
  }

  const poolFeeRaw = pairPoolFee ?? marketEnv(marketId, 'POOL_FEE', 'MANTLE_POOL_FEE') ?? '3000';
  const expectedOutRaw = marketEnv(marketId, 'EXPECTED_OUT', 'MANTLE_EXPECTED_OUT');

  return {
    missing: [],
    config: {
      router: getAddress(router as string),
      tokenIn: getAddress(tokenIn as string),
      tokenOut: getAddress(tokenOut as string),
      poolFee: Number(poolFeeRaw),
      privateKey: (privateKey as string).startsWith('0x')
        ? (privateKey as Hex)
        : (`0x${privateKey}` as Hex),
      rpcUrl: process.env.MANTLE_RPC_URL,
      notionalBudget: budget,
      slippageBps: Number(process.env.MANTLE_SLIPPAGE_BPS ?? '50'),
      deadlineSeconds: Number(process.env.MANTLE_DEADLINE_SECONDS ?? '120'),
      expectedOutFull: expectedOutRaw !== undefined ? Number(expectedOutRaw) : undefined
    }
  };
}

/// Real on-chain SPOT venue for Mantle v3 DEXes (Agni / Merchant Moe).
///
/// Maps a bounded consensus order to a single exactInputSingle swap:
///   amountIn = notionalBudget * (sizeBps / 10_000), clamped to wallet balance.
/// SPOT only — there is no margin/leverage path here by construction. SHORT/FLAT do not open
/// a leveraged short; they are treated as "no spot buy" and skipped (a real short would require
/// selling held inventory, which the caller models separately).
///
/// CAUTION: router + token addresses come entirely from env and are NOT validated against any
/// allowlist here. Verify MANTLE_DEX_ROUTER against the official Agni / Merchant Moe deployment
/// (and the token pair against the canonical Mantle token list) before broadcasting real funds.
///
/// Config is resolved PER MARKET from env at execute() time (keyed by order.marketId), so a
/// single venue instance trades multiple markets with independent token pairs and budgets.
///
/// SAFETY (this phase): broadcasting is gated behind MANTLE_BROADCAST=1. Without it the venue
/// builds + validates the swap (slippage/deadline/minOut guards) but stops before sending,
/// returning a 'skipped' dry-run receipt — never moving funds.
export class MantleSpotVenue implements IExecutionVenue {
  readonly name = 'mantle-spot';

  async execute(order: ExecutionOrder): Promise<ExecutionReceipt> {
    const { config, missing } = loadMantleConfig(order.marketId);
    if (!config) {
      return {
        venue: this.name,
        marketId: order.marketId,
        status: 'skipped',
        ref: order.id,
        detail: `Mantle spot venue not configured for ${order.marketId} (missing: ${missing.join(', ')})`
      };
    }

    // SPOT semantics: only a LONG with non-zero size translates to a buy. No leverage, ever.
    if (order.direction !== 'LONG' || order.sizeBps === 0) {
      return {
        venue: this.name,
        marketId: order.marketId,
        status: 'skipped',
        ref: order.id,
        detail: `no spot buy (direction=${order.direction}, sizeBps=${order.sizeBps})`
      };
    }
    if (order.sizeBps < 0 || order.sizeBps > 10_000) {
      return { venue: this.name, marketId: order.marketId, status: 'failed', ref: order.id, detail: `sizeBps out of range: ${order.sizeBps}` };
    }

    const { router, tokenIn, tokenOut, poolFee, privateKey, rpcUrl, notionalBudget, slippageBps, deadlineSeconds, expectedOutFull: quotedOut } =
      config;

    try {
      const account = privateKeyToAccount(privateKey);
      const transport = http(rpcUrl);
      const publicClient = createPublicClient({ chain: mantleSepoliaTestnet, transport });
      const walletClient = createWalletClient({ account, chain: mantleSepoliaTestnet, transport });

      const decimals = (await publicClient.readContract({
        address: tokenIn,
        abi: ERC20_ABI,
        functionName: 'decimals'
      })) as number;

      // amountIn = budget * sizeBps / 10_000, expressed in tokenIn's smallest unit.
      const budgetUnits = parseUnits(notionalBudget.toString(), decimals);
      const amountIn = (budgetUnits * BigInt(Math.round(order.sizeBps))) / 10_000n;
      if (amountIn === 0n) {
        return { venue: this.name, marketId: order.marketId, status: 'skipped', ref: order.id, detail: 'computed amountIn rounds to zero' };
      }

      const balance = (await publicClient.readContract({
        address: tokenIn,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address]
      })) as bigint;
      if (balance < amountIn) {
        return {
          venue: this.name,
          marketId: order.marketId,
          status: 'failed',
          ref: order.id,
          detail: `insufficient tokenIn balance: have ${formatUnits(balance, decimals)}, need ${formatUnits(amountIn, decimals)}`
        };
      }

      // Allowance check (read-only). A real broadcast would approve here; in dry-run we only
      // surface whether an approve would be needed, never sending one.
      const allowance = (await publicClient.readContract({
        address: tokenIn,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [account.address, router]
      })) as bigint;
      const needsApprove = allowance < amountIn;

      // Slippage guard. Requires a caller-supplied quote (expected tokenOut in human units for the
      // full budget) keyed per market; absent a quote we cannot safely set amountOutMinimum, so
      // refuse rather than broadcast a 0-min swap that invites sandwiching.
      if (quotedOut === undefined || !Number.isFinite(quotedOut) || quotedOut <= 0) {
        return {
          venue: this.name,
          marketId: order.marketId,
          status: 'failed',
          ref: order.id,
          detail: `refusing swap with no amountOutMinimum: set MANTLE_EXPECTED_OUT_${marketEnvKey(order.marketId)} (quoted tokenOut for full budget) to enable a slippage guard`
        };
      }
      const tokenOutDecimals = (await publicClient.readContract({
        address: tokenOut,
        abi: ERC20_ABI,
        functionName: 'decimals'
      })) as number;
      // Expected out scales with the same sizeBps fraction as amountIn.
      const expectedOutFull = parseUnits(quotedOut.toString(), tokenOutDecimals);
      const expectedOut = (expectedOutFull * BigInt(Math.round(order.sizeBps))) / 10_000n;
      const amountOutMinimum = (expectedOut * BigInt(10_000 - Math.round(slippageBps))) / 10_000n;
      if (amountOutMinimum === 0n) {
        return { venue: this.name, marketId: order.marketId, status: 'failed', ref: order.id, detail: 'amountOutMinimum rounds to zero; check the per-market MANTLE_EXPECTED_OUT quote' };
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + Math.max(1, Math.round(deadlineSeconds)));

      // SAFETY GATE: this phase never broadcasts. Unless MANTLE_BROADCAST=1 is explicitly set,
      // we stop here after fully validating the swap and return a dry-run receipt.
      if (process.env.MANTLE_BROADCAST !== '1') {
        return {
          venue: this.name,
          marketId: order.marketId,
          status: 'skipped',
          ref: order.id,
          detail: `dry-run (no broadcast): would swap ${formatUnits(amountIn, decimals)} tokenIn -> tokenOut, minOut ${formatUnits(amountOutMinimum, tokenOutDecimals)} (slippage ${slippageBps}bps, deadline +${deadlineSeconds}s${needsApprove ? ', approve required' : ''}). Set MANTLE_BROADCAST=1 to send.`
        };
      }

      // Beyond here funds can move. Approve if short, then swap.
      if (needsApprove) {
        const approveData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [router, amountIn]
        });
        const approveHash = await walletClient.sendTransaction({ to: tokenIn, data: approveData });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      const swapData = encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [
          {
            tokenIn,
            tokenOut,
            fee: poolFee,
            recipient: account.address,
            deadline,
            amountIn,
            amountOutMinimum,
            sqrtPriceLimitX96: 0n
          }
        ]
      });

      const swapHash = await walletClient.sendTransaction({ to: router, data: swapData, value: 0n });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: swapHash });

      if (receipt.status !== 'success') {
        return { venue: this.name, marketId: order.marketId, status: 'failed', ref: order.id, detail: `swap reverted (tx ${swapHash})` };
      }
      return {
        venue: this.name,
        marketId: order.marketId,
        status: 'filled',
        ref: swapHash,
        detail: `spot buy ${formatUnits(amountIn, decimals)} tokenIn -> tokenOut (minOut ${formatUnits(amountOutMinimum, tokenOutDecimals)}, slippage ${slippageBps}bps)`
      };
    } catch (error) {
      return {
        venue: this.name,
        marketId: order.marketId,
        status: 'failed',
        ref: order.id,
        detail: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

/// Select the venue from EXECUTION_VENUE (default: paper). The chosen venue trades every active
/// market; per-market config (Mantle token pair / budget) is resolved inside execute().
export function selectVenue(): IExecutionVenue {
  const mode = (process.env.EXECUTION_VENUE ?? 'paper').toLowerCase();
  if (mode === 'mantle' || mode === 'mantle-spot') {
    return new MantleSpotVenue();
  }
  if (mode === 'byreal' || mode === 'byreal-spot') {
    return new ByrealSpotVenue(process.env.BYREAL_ENDPOINT);
  }
  return new PaperVenue();
}
