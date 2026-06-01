import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { getAddress, type Hex } from 'viem';
import { erc8004Addresses, registerAgentIdentity, toAgentId, type Erc8004Network } from '@sibyl/sdk';

// The five Sibyl agents (must match packages/agents + the committed replay).
const AGENT_IDS = ['news_v1', 'funding_v1', 'onchain_oi_v1', 'momentum_v1', 'rogue_10x_v1'];

type IdentityRecord = {
  name: string;
  ledgerAgentId: `0x${string}`;
  agentURI: string;
  erc8004AgentId: string;
  txHash: string;
};

const outPath = resolve(process.cwd(), '../../deployments/agent-identities.json');

function load(): IdentityRecord[] {
  if (!existsSync(outPath)) return [];
  return JSON.parse(readFileSync(outPath, 'utf8')) as IdentityRecord[];
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY as Hex | undefined;
  if (!privateKey) throw new Error('PRIVATE_KEY is required to mint identity NFTs');

  const network = (process.env.ERC8004_NETWORK as Erc8004Network) ?? 'testnet';
  const identityRegistry = getAddress(erc8004Addresses(network).identityRegistry);

  const records = load();
  const done = new Set(records.map((r) => r.name));

  for (const name of AGENT_IDS) {
    if (done.has(name)) {
      console.log(`skip ${name} (already registered: agentId ${records.find((r) => r.name === name)?.erc8004AgentId})`);
      continue;
    }
    const ledgerAgentId = toAgentId(name);
    const agentURI = `sibyl://agent/${name}?ledgerId=${ledgerAgentId}`;
    const { agentId, txHash } = await registerAgentIdentity(identityRegistry, agentURI, privateKey);
    const record: IdentityRecord = {
      name,
      ledgerAgentId,
      agentURI,
      erc8004AgentId: agentId.toString(),
      txHash
    };
    records.push(record);
    console.log(`registered ${name} -> ERC-8004 agentId ${record.erc8004AgentId} (tx ${txHash})`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(records, null, 2) + '\n');
  }

  console.log(`\nAll ${records.length} agent identities recorded at ${outPath}`);
}

main().catch((error) => {
  console.error('register-agents failed:', error);
  process.exit(1);
});
