import { Controller, Get, Inject, Query, Sse } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { RoundsService, type RoundEvent } from './rounds.service.js';

/// The live arena surface: snapshot state + a Server-Sent-Events stream the web app
/// subscribes to (EventSource) for real-time round_open / round_resolved updates.
/// NOTE: explicit @Inject token — tsx/esbuild does not emit design:paramtypes metadata,
/// so type-based constructor injection silently yields undefined here.
@Controller('rounds')
export class RoundsController {
  constructor(@Inject(RoundsService) private readonly rounds: RoundsService) {}

  /// GET /rounds?market=MNT-USD — current round, live reputation and recent history.
  @Get()
  state(@Query('market') market?: string) {
    return this.rounds.state(market);
  }

  /// GET /rounds/stream?market=MNT-USD — SSE stream of RoundEvent.
  @Sse('stream')
  stream(@Query('market') market?: string): Observable<{ data: RoundEvent }> {
    return this.rounds.stream(market);
  }
}
