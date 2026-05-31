import { Module } from '@nestjs/common';
import { HealthController } from '../health/health.controller.js';
import { ConsensusController } from '../consensus/consensus.controller.js';

@Module({
  controllers: [HealthController, ConsensusController]
})
export class AppModule {}
