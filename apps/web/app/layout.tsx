import type { ReactNode } from 'react';

export const metadata = {
  title: 'Sibyl — On-Chain Proof-of-Edge',
  description: "Don't trust the loudest agent. Trust the one with a verifiable track record."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          margin: 0,
          padding: 0,
          background: '#0b0e14',
          color: '#e6e9ef'
        }}
      >
        {children}
      </body>
    </html>
  );
}
