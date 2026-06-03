'use client';

import { useState, type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { wagmiConfig } from '../lib/wagmi';

import '@rainbow-me/rainbowkit/styles.css';

/**
 * Client-side wallet/data providers for the app router.
 *
 * Order matters: WagmiProvider → QueryClientProvider → RainbowKitProvider.
 * The wagmi config is created with `ssr: true` (see lib/wagmi.ts) so server
 * rendering never touches browser storage; the QueryClient is created lazily in
 * state so it is stable across re-renders and not shared between requests.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#8b5cf6',
            accentColorForeground: '#0a0a0f',
            borderRadius: 'large'
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
