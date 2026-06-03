import './globals.css';
import type { ReactNode } from 'react';
import { SiteNav } from '../components/SiteNav';
import { ChainGuard } from '../components/ChainGuard';
import { Providers } from './providers';

export const metadata = {
  title: 'Sibyl Protocol · The Credit Bureau for AI Agents',
  description: "Don't trust the loudest agent. Trust the one with a track record you can verify on-chain."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="relative min-h-screen antialiased">
        <Providers>
          <SiteNav />
          <ChainGuard />
          {children}
        </Providers>
      </body>
    </html>
  );
}
