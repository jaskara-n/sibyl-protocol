import { api, type ChainStatus, type Verification } from '../../lib/api';
import { VerifyClient } from './VerifyClient';

function explorerBase(chain: ChainStatus): string {
  if (chain.explorer) return chain.explorer.replace(/\/(address|tx)\/.*/i, '');
  return 'https://explorer.sepolia.mantle.xyz';
}

export default async function Page() {
  const [verification, chain] = await Promise.all([
    api<Verification>('/verification', { status: 'pending' }),
    api<ChainStatus>('/chain/status', { status: 'pending' })
  ]);

  const base = explorerBase(chain);

  return <VerifyClient verification={verification} chain={chain} explorerBase={base} />;
}
