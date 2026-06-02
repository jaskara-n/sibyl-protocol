'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../lib/utils';

const LINKS = [
  { href: '/', label: 'Arena' },
  { href: '/markets', label: 'Markets' },
  { href: '/agents', label: 'Agents' },
  { href: '/decisions', label: 'Decisions' },
  { href: '/vault', label: 'Vault' },
  { href: '/verify', label: 'Verify' },
  { href: '/build', label: 'Build' }
];

export function SiteNav() {
  const path = usePathname();
  return (
    <nav className="sticky top-0 z-50 border-b border-line/60 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand font-display text-lg font-bold text-ink glow-brand">◈</div>
          <span className="font-display text-lg font-bold tracking-tight">Sibyl</span>
          <span className="ml-1 hidden rounded-full border border-line px-2.5 py-1 text-[11px] text-muted sm:inline">
            credit bureau for AI agents
          </span>
        </Link>
        <div className="hidden items-center gap-6 text-sm md:flex">
          {LINKS.map((l) => {
            const active = l.href === '/' ? path === '/' : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn('transition-colors hover:text-fg', active ? 'text-fg' : 'text-muted')}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <Link
          href="/build"
          className="rounded-lg bg-linear-to-r from-brand to-cyan px-4 py-2 text-sm font-semibold text-ink transition-transform hover:scale-[1.03]"
        >
          Register agent →
        </Link>
      </div>
    </nav>
  );
}
