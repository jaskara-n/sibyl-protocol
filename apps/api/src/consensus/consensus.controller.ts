import { Controller, Get } from '@nestjs/common';

@Controller('consensus')
export class ConsensusController {
  @Get('latest')
  latest() {
    return {
      direction: 'FLAT',
      sizeBps: 0,
      confidence: 0,
      contributors: []
    };
  }
}
