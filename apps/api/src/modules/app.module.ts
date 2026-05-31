import { Module } from '@nestjs/common';
import { HealthController } from '../health/health.controller.js';
import { ConsensusController } from '../consensus/consensus.controller.js';
import { VerificationController } from '../verification/verification.controller.js';

@Module({
  controllers: [HealthController, ConsensusController, VerificationController]
})
export class AppModule {}
