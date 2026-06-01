'use client';

import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';

/** Single entrance reveal (server children allowed). */
export function BuildReveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: 'easeOut', delay }}
    >
      {children}
    </motion.div>
  );
}

/** Staggered grid: each direct child fades+rises in sequence. */
export function StaggerList({ children, className }: { children: ReactNode; className?: string }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
      variants={{ show: { transition: { staggerChildren: 0.08 } } }}
    >
      {items.map((child, i) => (
        <motion.div
          key={i}
          variants={{
            hidden: { opacity: 0, y: 18 },
            show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } }
          }}
          className="h-full"
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

/** macOS-style terminal frame with lightweight token coloring. */
export function CodeTerminal({ title, code }: { title: string; code: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="glass overflow-hidden rounded-2xl"
    >
      <div className="flex items-center gap-2 border-b border-line bg-ink/60 px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-short/80" />
        <span className="h-3 w-3 rounded-full bg-amber/80" />
        <span className="h-3 w-3 rounded-full bg-long/80" />
        <span className="ml-3 font-mono text-xs text-muted">{title}</span>
        <span className="ml-auto font-mono text-[11px] text-muted/70">@sibyl/agent-sdk</span>
      </div>
      <pre className="overflow-x-auto bg-ink p-5 font-mono text-[12.5px] leading-relaxed">
        <code>{highlight(code)}</code>
      </pre>
    </motion.div>
  );
}

function highlight(code: string): ReactNode {
  const KEYWORDS = new Set([
    'import',
    'from',
    'export',
    'default',
    'async',
    'const',
    'return',
    'await',
    'let'
  ]);
  return code.split('\n').map((line, li) => {
    // comments
    if (line.trimStart().startsWith('#') || line.trimStart().startsWith('//')) {
      return (
        <span key={li} className="text-muted/60">
          {line}
          {'\n'}
        </span>
      );
    }
    // shell prompt lines
    if (line.trimStart().startsWith('$')) {
      const idx = line.indexOf('$');
      const inlineComment = line.indexOf('#', idx + 1);
      const cmd = inlineComment === -1 ? line.slice(idx) : line.slice(idx, inlineComment);
      const rest = inlineComment === -1 ? '' : line.slice(inlineComment);
      return (
        <span key={li}>
          <span className="text-brand">{line.slice(0, idx)}$ </span>
          <span className="text-long">{cmd.replace(/^\$\s*/, '')}</span>
          {rest && <span className="text-muted/60">{rest}</span>}
          {'\n'}
        </span>
      );
    }
    const tokens = line.split(/(\s+|[(){}.,;])/);
    return (
      <span key={li}>
        {tokens.map((tok, ti) => {
          if (KEYWORDS.has(tok)) return <span key={ti} className="text-brand">{tok}</span>;
          if (/^"[^"]*"$/.test(tok)) return <span key={ti} className="text-long">{tok}</span>;
          if (/^(LONG|SHORT|FLAT)$/.test(tok)) return <span key={ti} className="text-cyan">{tok}</span>;
          if (/^(predict|defineAgent|runRounds|tanh|at)$/.test(tok)) return <span key={ti} className="text-cyan">{tok}</span>;
          if (/^[0-9.]+$/.test(tok)) return <span key={ti} className="text-amber">{tok}</span>;
          return <span key={ti} className="text-fg/90">{tok}</span>;
        })}
        {'\n'}
      </span>
    );
  });
}

/** Visual-only connect-wallet CTA (wallet wiring pending). */
export function ConnectWalletCTA() {
  const [poked, setPoked] = useState(false);
  return (
    <div className="mt-5">
      <motion.button
        type="button"
        onClick={() => setPoked(true)}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        aria-disabled
        className="w-full rounded-xl bg-linear-to-r from-brand to-cyan px-5 py-3 text-center font-display font-semibold text-ink glow-brand"
      >
        Connect wallet to register →
      </motion.button>
      <p className="mt-2.5 text-center font-mono text-[11px] text-muted">
        {poked
          ? 'wallet wiring pending — this button is a preview, not yet live.'
          : 'preview only · non-functional pending wallet wiring'}
      </p>
    </div>
  );
}
