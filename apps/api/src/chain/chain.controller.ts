import { Controller, Get } from '@nestjs/common';
import { getAddress } from 'viem';
import { readLedgerState } from '@sibyl/sdk';
import { readReplayArtifact, readDeployedLedger } from '../lib/artifacts.js';

@Controller('chain')
export class ChainController {
  @Get('status')
  async status() {
    // Source of truth: SIBYL_LEDGER_ADDRESS env, else the committed deployments record.
    const deployed = readDeployedLedger();
    const ledgerAddress = process.env.SIBYL_LEDGER_ADDRESS ?? deployed?.address;
    if (!ledgerAddress) {
      return {
        status: 'pending',
        message: 'No deployment configured (set SIBYL_LEDGER_ADDRESS or deployments/mantle-sepolia.json)'
      };
    }

    try {
      const state = await readLedgerState(getAddress(ledgerAddress));
      const replay = readReplayArtifact();

      return {
        status: 'ready',
        ledgerAddress,
        network: deployed?.network,
        explorer: deployed?.explorer ? `${deployed.explorer}/address/${ledgerAddress}` : undefined,
        owner: state.owner,
        scoringVersion: state.latestScoringVersion,
        epoch: state.epoch,
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
