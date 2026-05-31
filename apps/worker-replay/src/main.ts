import { brierScore } from '@sibyl/shared';

function demoReplayRun() {
  const score = brierScore(0.7, 1);
  console.log('Replay worker booted. Demo Brier score:', score);
}

demoReplayRun();
