import { Controller, Get } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

@Controller('verification')
export class VerificationController {
  @Get()
  verification() {
    try {
      const artifactPath = resolve(process.cwd(), '../../data/artifacts/replay-scores.json');
      const payload = JSON.parse(readFileSync(artifactPath, 'utf8'));
      return payload;
    } catch {
      return {
        status: 'pending',
        message: 'Replay artifacts not generated yet'
      };
    }
  }
}
