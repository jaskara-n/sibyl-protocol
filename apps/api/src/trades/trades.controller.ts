import { Controller, Get } from '@nestjs/common';
import { readTradeArtifacts } from '../lib/artifacts.js';

@Controller('trades')
export class TradesController {
  @Get()
  list() {
    return readTradeArtifacts();
  }
}
