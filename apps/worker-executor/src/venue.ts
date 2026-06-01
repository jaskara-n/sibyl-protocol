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
  timestamp: number;
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'FLAT';
  sizeBps: number;
  confidence: number;
  contributors: string[];
}

export interface ExecutionReceipt {
  venue: string;
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

/// Default venue: records a bounded paper trade to the artifacts feed. No real funds, no leverage.
export class PaperVenue implements IExecutionVenue {
  readonly name = 'paper';

  async execute(order: ExecutionOrder): Promise<ExecutionReceipt> {
    if (order.direction === 'FLAT' || order.sizeBps === 0) {
      return { venue: this.name, status: 'skipped', ref: order.id, detail: 'no edge (FLAT / zero size)' };
    }
    const tradesPath = resolve(ARTIFACT_DIR, 'trade-events.json');
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    const existing: unknown[] = existsSync(tradesPath)
      ? (JSON.parse(readFileSync(tradesPath, 'utf8')) as unknown[])
      : [];
    existing.unshift({ ...order, mode: 'paper' });
    writeFileSync(tradesPath, JSON.stringify(existing.slice(0, 100), null, 2));
    return { venue: this.name, status: 'filled', ref: order.id };
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
}

/// Pull config from env. Returns null (clean skip) if any required field is missing, mirroring
/// the paper/Byreal fallthrough so the worker never crashes when execution isn't wired.
function loadMantleConfig(): { config?: MantleSpotConfig; missing: string[] } {
  const missing: string[] = [];
  const router = process.env.MANTLE_DEX_ROUTER;
  const tokenIn = process.env.IN_TOKEN;
  const tokenOut = process.env.OUT_TOKEN;
  const privateKey = process.env.PRIVATE_KEY;
  const budgetRaw = process.env.MANTLE_NOTIONAL_BUDGET;

  if (!router) missing.push('MANTLE_DEX_ROUTER');
  if (!tokenIn) missing.push('IN_TOKEN');
  if (!tokenOut) missing.push('OUT_TOKEN');
  if (!privateKey) missing.push('PRIVATE_KEY');
  if (!budgetRaw) missing.push('MANTLE_NOTIONAL_BUDGET');
  if (missing.length > 0) return { missing };

  const budget = Number(budgetRaw);
  if (!Number.isFinite(budget) || budget <= 0) {
    return { missing: ['MANTLE_NOTIONAL_BUDGET (must be a positive number)'] };
  }

  return {
    missing: [],
    config: {
      router: getAddress(router as string),
      tokenIn: getAddress(tokenIn as string),
      tokenOut: getAddress(tokenOut as string),
      poolFee: Number(process.env.MANTLE_POOL_FEE ?? '3000'),
      privateKey: (privateKey as string).startsWith('0x')
        ? (privateKey as Hex)
        : (`0x${privateKey}` as Hex),
      rpcUrl: process.env.MANTLE_RPC_URL,
      notionalBudget: budget,
      slippageBps: Number(process.env.MANTLE_SLIPPAGE_BPS ?? '50'),
      deadlineSeconds: Number(process.env.MANTLE_DEADLINE_SECONDS ?? '120')
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
/// (and IN_TOKEN/OUT_TOKEN against the canonical Mantle token list) before broadcasting real funds.
export class MantleSpotVenue implements IExecutionVenue {
  readonly name = 'mantle-spot';

  constructor(private readonly config?: MantleSpotConfig) {}

  async execute(order: ExecutionOrder): Promise<ExecutionReceipt> {
    if (!this.config) {
      return {
        venue: this.name,
        status: 'skipped',
        ref: order.id,
        detail: 'Mantle spot venue not configured (set MANTLE_DEX_ROUTER, IN_TOKEN, OUT_TOKEN, PRIVATE_KEY, MANTLE_NOTIONAL_BUDGET)'
      };
    }

    // SPOT semantics: only a LONG with non-zero size translates to a buy. No leverage, ever.
    if (order.direction !== 'LONG' || order.sizeBps === 0) {
      return {
        venue: this.name,
        status: 'skipped',
        ref: order.id,
        detail: `no spot buy (direction=${order.direction}, sizeBps=${order.sizeBps})`
      };
    }
    if (order.sizeBps < 0 || order.sizeBps > 10_000) {
      return { venue: this.name, status: 'failed', ref: order.id, detail: `sizeBps out of range: ${order.sizeBps}` };
    }

    const { router, tokenIn, tokenOut, poolFee, privateKey, rpcUrl, notionalBudget, slippageBps, deadlineSeconds } =
      this.config;

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
        return { venue: this.name, status: 'skipped', ref: order.id, detail: 'computed amountIn rounds to zero' };
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
          status: 'failed',
          ref: order.id,
          detail: `insufficient tokenIn balance: have ${formatUnits(balance, decimals)}, need ${formatUnits(amountIn, decimals)}`
        };
      }

      // Ensure the router can pull tokenIn. Approve exactly amountIn if allowance is short.
      const allowance = (await publicClient.readContract({
        address: tokenIn,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [account.address, router]
      })) as bigint;
      if (allowance < amountIn) {
        const approveData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [router, amountIn]
        });
        const approveHash = await walletClient.sendTransaction({ to: tokenIn, data: approveData });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // Slippage guard. Prefer a caller-supplied quote (expected amountOut in tokenOut human units)
      // via order/env; absent a quote we cannot safely set amountOutMinimum, so refuse rather than
      // broadcast a 0-min swap that invites sandwiching.
      const quoteRaw = process.env.MANTLE_EXPECTED_OUT;
      if (!quoteRaw) {
        return {
          venue: this.name,
          status: 'failed',
          ref: order.id,
          detail: 'refusing swap with no amountOutMinimum: set MANTLE_EXPECTED_OUT (quoted tokenOut for full budget) to enable a slippage guard'
        };
      }
      const tokenOutDecimals = (await publicClient.readContract({
        address: tokenOut,
        abi: ERC20_ABI,
        functionName: 'decimals'
      })) as number;
      // Expected out scales with the same sizeBps fraction as amountIn.
      const expectedOutFull = parseUnits(Number(quoteRaw).toString(), tokenOutDecimals);
      const expectedOut = (expectedOutFull * BigInt(Math.round(order.sizeBps))) / 10_000n;
      const amountOutMinimum = (expectedOut * BigInt(10_000 - Math.round(slippageBps))) / 10_000n;
      if (amountOutMinimum === 0n) {
        return { venue: this.name, status: 'failed', ref: order.id, detail: 'amountOutMinimum rounds to zero; check MANTLE_EXPECTED_OUT' };
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + Math.max(1, Math.round(deadlineSeconds)));

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
        return { venue: this.name, status: 'failed', ref: order.id, detail: `swap reverted (tx ${swapHash})` };
      }
      return {
        venue: this.name,
        status: 'filled',
        ref: swapHash,
        detail: `spot buy ${formatUnits(amountIn, decimals)} tokenIn -> tokenOut (minOut ${formatUnits(amountOutMinimum, tokenOutDecimals)}, slippage ${slippageBps}bps)`
      };
    } catch (error) {
      return {
        venue: this.name,
        status: 'failed',
        ref: order.id,
        detail: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

/// Select the venue from EXECUTION_VENUE (default: paper).
export function selectVenue(): IExecutionVenue {
  const mode = (process.env.EXECUTION_VENUE ?? 'paper').toLowerCase();
  if (mode === 'mantle' || mode === 'mantle-spot') {
    const { config } = loadMantleConfig();
    return new MantleSpotVenue(config);
  }
  if (mode === 'byreal' || mode === 'byreal-spot') {
    return new ByrealSpotVenue(process.env.BYREAL_ENDPOINT);
  }
  return new PaperVenue();
}
