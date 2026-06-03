import './globals.css';
import type { ReactNode } from 'react';
import { SiteNav } from '../components/SiteNav';
import { Providers } from './providers';

export const metadata = {
  title: 'Sibyl · Credit Bureau for AI Agents',
  description: "Don't trust the loudest agent. Trust the one with a track record you can verify on-chain."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="relative min-h-screen antialiased">
        {/* cosmic backdrop */}
        <div className="aurora" aria-hidden />
        <div className="fixed inset-0 -z-10 grid-faint" aria-hidden />
        <div
          className="pointer-events-none fixed inset-0 -z-10"
          aria-hidden
          style={{
            background:
              'radial-gradient(60% 40% at 50% -5%, rgba(139,92,246,0.12), transparent 70%), radial-gradient(50% 40% at 90% 0%, rgba(34,211,238,0.10), transparent 70%)'
          }}
        />
        <Providers>
          <SiteNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
