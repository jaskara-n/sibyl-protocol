import { defineChain } from 'viem';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';

/**
 * Mantle Sepolia testnet (chain id 5003) — the network the Sibyl protocol
 * contracts are deployed to. Defined locally (rather than pulled from a chain
 * registry) so the wallet layer is self-contained and build-time deterministic.
 */
export const mantleSepolia = defineChain({
  id: 5003,
  name: 'Mantle Sepolia',
  nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.sepolia.mantle.xyz'] }
  },
  blockExplorers: {
    default: {
      name: 'Mantle Sepolia Explorer',
      url: 'https://explorer.sepolia.mantle.xyz'
    }
  },
  testnet: true
});

/**
 * WalletConnect project id. RainbowKit requires one for WalletConnect-based
 * wallets; injected/MetaMask works regardless. Read from the public env with a
 * safe placeholder fallback so the demo builds without secrets configured.
 */
const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? 'sibyl-demo-placeholder';

/**
 * wagmi + RainbowKit config. `getDefaultConfig` wires up the standard wallet
 * connectors (injected/MetaMask, WalletConnect, Coinbase, etc.) against the
 * Mantle Sepolia chain. `ssr: true` is required for the Next.js app-router so
 * wagmi does not touch browser-only storage during server rendering.
 */
export const wagmiConfig = getDefaultConfig({
  appName: 'Sibyl Protocol',
  projectId,
  chains: [mantleSepolia],
  ssr: true
});
