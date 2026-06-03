'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { cn } from '../lib/utils';

const LINKS = [
  { href: '/', label: 'Arena' },
  { href: '/markets', label: 'Markets' },
  { href: '/forecast', label: 'Forecast' },
  { href: '/create', label: 'Create' },
  { href: '/agents', label: 'Agents' },
  { href: '/decisions', label: 'Decisions' },
  { href: '/vault', label: 'Vault' },
  { href: '/verify', label: 'Verify' },
  { href: '/build', label: 'Build' }
];

/**
 * The bureau letterhead: serif wordmark, mono-caps links over a hairline rule,
 * and a custom-drawn wallet control (no default RainbowKit chrome).
 */
export function SiteNav() {
  const path = usePathname();
  return (
    <nav className="sticky top-0 z-50 border-b border-bureau-line bg-bureau/92 backdrop-blur-md">
      {/* full-bleed: logo flush to the very left, wallet flush right */}
      <div className="flex w-full items-center justify-between gap-6 px-5 py-3 sm:px-7">
        <Link href="/" className="group flex shrink-0 items-baseline gap-3">
          <span className="grid h-8 w-8 -translate-y-0.5 place-items-center self-center border border-brass/60 font-serifd text-lg italic text-brass transition-colors group-hover:border-brass">
            S
          </span>
          <span className="font-serifd text-2xl leading-none text-bureau-fg">Sibyl</span>
          <span className="hidden whitespace-nowrap font-monod text-[9px] uppercase tracking-[0.3em] text-bureau-muted xl:inline">
            protocol · credit bureau for AI agents
          </span>
        </Link>

        {/* everything else sits as one group, pushed hard right */}
        <div className="flex items-center justify-end gap-7">
          <div className="hidden items-center gap-5 lg:flex">
          {LINKS.map((l) => {
            const active = l.href === '/' ? path === '/' : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'border-b pb-0.5 font-monod text-[10px] uppercase tracking-[0.22em] transition-colors',
                  active
                    ? 'border-brass text-brass'
                    : 'border-transparent text-bureau-muted hover:text-bureau-fg'
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        <ConnectButton.Custom>
          {(props: Parameters<React.ComponentProps<typeof ConnectButton.Custom>['children']>[0]) => {
            const { account, chain, openAccountModal, openChainModal, openConnectModal, mounted } = props;
            const ready = mounted;
            const connected = ready && account && chain;
            return (
              <div
                aria-hidden={!ready}
                className={!ready ? 'pointer-events-none select-none opacity-0' : ''}
              >
                {!connected ? (
                  <button
                    onClick={openConnectModal}
                    type="button"
                    className="bg-bureau-fg px-4 py-2 font-sansd text-sm font-semibold text-bureau transition-colors hover:bg-brass"
                  >
                    Connect wallet
                  </button>
                ) : chain.unsupported ? (
                  <button
                    onClick={openChainModal}
                    type="button"
                    className="border border-fall/60 px-4 py-2 font-monod text-[10px] uppercase tracking-[0.18em] text-fall transition-colors hover:border-fall"
                  >
                    Wrong network · switch
                  </button>
                ) : (
                  <button
                    onClick={openAccountModal}
                    type="button"
                    className="flex items-center gap-2.5 border border-bureau-line px-3.5 py-2 font-monod text-xs text-bureau-fg transition-colors hover:border-brass"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-rise" aria-hidden />
                    {account.displayName}
                  </button>
                )}
              </div>
            );
          }}
        </ConnectButton.Custom>
        </div>
      </div>
    </nav>
  );
}
