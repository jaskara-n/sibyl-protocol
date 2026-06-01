import { Module } from '@nestjs/common';
import { HealthController } from '../health/health.controller.js';
import { ConsensusController } from '../consensus/consensus.controller.js';
import { VerificationController } from '../verification/verification.controller.js';
import { AgentsController } from '../agents/agents.controller.js';
import { TradesController } from '../trades/trades.controller.js';
import { ChainController } from '../chain/chain.controller.js';

@Module({
  controllers: [
    HealthController,
    ConsensusController,
    VerificationController,
    AgentsController,
    TradesController,
    ChainController
  ]
})
export class AppModule {}
