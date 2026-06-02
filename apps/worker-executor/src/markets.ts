import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { keccak256, toBytes, type Hex } from 'viem';
import { mantleClient, SIBYL_LEDGER_ABI } from '@sibyl/sdk';

/// A market the executor trades. `symbol` is the off-chain identifier (and the `marketId`
/// stamped on every Signal / ReplayScore); `marketIdHex` is its on-chain bytes32 form
/// (keccak256(symbol)), matching the contract convention used by the replay payload.
export interface Market {
  symbol: string;
  marketIdHex: Hex;
}

/// marketId on-chain is bytes32 == keccak256(symbol) — same derivation the replay payload uses.
export function toMarketIdHex(symbol: string): Hex {
  return keccak256(toBytes(symbol));
}

/// Static fallback market set. Used for the paper dry-run when there is no RPC / deployment to
/// read the live active-market set from the ledger. Keep in sync with the replay dataset symbols.
export const FALLBACK_MARKETS: readonly string[] = ['MNT-USD', 'ETH-USD'];

/// Build a Market record from a symbol.
function toMarket(symbol: string): Market {
  return { symbol, marketIdHex: toMarketIdHex(symbol) };
}

/// Resolve the SibylLedger address from env or the canonical deployments file. Returns null when
/// neither is available (offline / undeployed) so callers can fall back to the static config.
function resolveLedger(): Hex | null {
  if (process.env.SIBYL_LEDGER_ADDRESS) return process.env.SIBYL_LEDGER_ADDRESS as Hex;
  const path = resolve(process.cwd(), '../../deployments/mantle-sepolia.json');
  if (!existsSync(path)) return null;
  try {
    const d = JSON.parse(readFileSync(path, 'utf8')) as {
      contracts?: { SibylLedger?: { address?: string } };
    };
    const addr = d.contracts?.SibylLedger?.address;
    return addr ? (addr as Hex) : null;
  } catch {
    return null;
  }
}

/// Resolve the set of ACTIVE markets to trade.
///
/// Preferred path: read the ledger's `getMarkets()` and keep only the ones `isMarketActive()`.
/// On-chain markets are bytes32, so we map them back to known symbols via keccak256(symbol).
/// Fallback path (no RPC / no deployment / read fails / no active markets): the static
/// {@link FALLBACK_MARKETS} config, so the paper dry-run works fully offline.
export async function getActiveMarkets(
  symbols: readonly string[] = FALLBACK_MARKETS
): Promise<Market[]> {
  const fallback = symbols.map(toMarket);

  // No RPC configured -> stay offline, use the static config.
  if (!process.env.MANTLE_RPC_URL) return fallback;

  const ledger = resolveLedger();
  if (!ledger) return fallback;

  try {
    const onchain = (await mantleClient.readContract({
      address: ledger,
      abi: SIBYL_LEDGER_ABI,
      functionName: 'getMarkets'
    })) as readonly Hex[];

    if (!onchain || onchain.length === 0) return fallback;

    const bySymbol = new Map(fallback.map((m) => [m.marketIdHex.toLowerCase(), m]));
    const active: Market[] = [];
    for (const idHex of onchain) {
      const known = bySymbol.get(idHex.toLowerCase());
      if (!known) continue; // unknown on-chain market with no symbol mapping; skip
      const isActive = (await mantleClient.readContract({
        address: ledger,
        abi: SIBYL_LEDGER_ABI,
        functionName: 'isMarketActive',
        args: [idHex]
      })) as boolean;
      if (isActive) active.push(known);
    }

    return active.length > 0 ? active : fallback;
  } catch {
    // Any chain error -> deterministic offline fallback.
    return fallback;
  }
}
