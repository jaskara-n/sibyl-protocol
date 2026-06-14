import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Open CORS: this is a public, read-only API consumed by the web frontend
  // (and anyone re-running the benchmark). Restrict via CORS_ORIGIN if needed.
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? true });
  // Hosts like Render/Railway inject PORT and require binding 0.0.0.0.
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`Sibyl API running on :${port}`);
}

bootstrap();
