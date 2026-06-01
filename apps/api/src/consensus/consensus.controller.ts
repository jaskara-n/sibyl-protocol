import { Controller, Get } from '@nestjs/common';
import { readTradeArtifacts } from '../lib/artifacts.js';

@Controller('consensus')
export class ConsensusController {
  @Get('latest')
  latest() {
    const trades = readTradeArtifacts();
    if (trades.length === 0) {
      return {
        direction: 'FLAT',
        sizeBps: 0,
        confidence: 0.5,
        contributors: [],
        source: 'no-trades-yet'
      };
    }

    const latest = trades[0];
    return {
      direction: latest.direction,
      sizeBps: latest.sizeBps,
      confidence: latest.confidence,
      contributors: latest.contributors,
      source: latest.id,
      timestamp: latest.timestamp
    };
  }
}
