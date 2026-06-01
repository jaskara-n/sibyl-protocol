import { Controller, Get } from '@nestjs/common';
import { getAddress } from 'viem';
import { readLedgerState } from '@sibyl/sdk';
import { readReplayArtifact } from '../lib/artifacts.js';

@Controller('chain')
export class ChainController {
  @Get('status')
  async status() {
    const ledgerAddress = process.env.SIBYL_LEDGER_ADDRESS;
    if (!ledgerAddress) {
      return {
        status: 'pending',
        message: 'SIBYL_LEDGER_ADDRESS not configured'
      };
    }

    try {
      const state = await readLedgerState(getAddress(ledgerAddress));
      const replay = readReplayArtifact();

      return {
        status: 'ready',
        ledgerAddress,
        owner: state.owner,
        onchainLatestDatasetHash: state.latestDatasetHash,
        localLatestDatasetHash: replay?.datasetHash ?? null,
        isSynced: replay ? replay.datasetHash === state.latestDatasetHash : false
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Unable to read chain state',
        error: error instanceof Error ? error.message : 'unknown error'
      };
    }
  }
}
