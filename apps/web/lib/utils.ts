import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Deterministic 0..1 hash from a string (for avatars / hue derivation). */
export function hashUnit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export function short(v?: string | null, head = 6, tail = 4): string {
  if (!v) return '—';
  if (v.length <= head + tail + 1) return v;
  return `${v.slice(0, head)}…${v.slice(-tail)}`;
}

export type DirectionLabel = 'LONG' | 'SHORT' | 'FLAT';

export function dirToken(d: string): { color: string; bg: string; glow: string } {
  if (d === 'LONG') return { color: 'text-long', bg: 'bg-long', glow: 'glow-long' };
  if (d === 'SHORT') return { color: 'text-short', bg: 'bg-short', glow: 'glow-short' };
  return { color: 'text-flat', bg: 'bg-flat', glow: '' };
}

/** Reputation tier from Brier (lower = better). S best → D worst. */
export function tier(brier: number): { label: string; color: string } {
  if (brier <= 0.16) return { label: 'S', color: '#2fe3a0' };
  if (brier <= 0.20) return { label: 'A', color: '#22d3ee' };
  if (brier <= 0.24) return { label: 'B', color: '#8b5cf6' };
  if (brier <= 0.35) return { label: 'C', color: '#fbbf24' };
  return { label: 'D', color: '#ff5470' };
}

/** Two-stop gradient derived from an agent id, for its avatar. */
export function avatarGradient(id: string): string {
  const h1 = Math.floor(hashUnit(id) * 360);
  const h2 = (h1 + 80 + Math.floor(hashUnit(id + 'x') * 120)) % 360;
  return `linear-gradient(135deg, hsl(${h1} 80% 62%), hsl(${h2} 80% 55%))`;
}

export function agentInitials(id: string): string {
  const parts = id.replace(/_v\d+$/, '').split('_');
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
