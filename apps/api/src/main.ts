import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { configureHttpApp } from './http-app.js';
import { AppConfig } from './platform/config/app-config.js';
import { ConfigValidationError } from './platform/config/env.schema.js';
import { loadRootEnv } from './platform/config/load-env.js';

export async function bootstrap(): Promise<void> {
  loadRootEnv();
  let config: AppConfig;
  try {
    config = AppConfig.fromProcessEnv();
  } catch (err) {
    if (err instanceof ConfigValidationError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const app = await NestFactory.create(AppModule.forRoot(config), { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureHttpApp(app, config);
  app.enableShutdownHooks();
  await app.listen(config.env.API_PORT);
  app.get(Logger).log(`API listening on http://localhost:${config.env.API_PORT}/v1`, 'Bootstrap');
}

void bootstrap();
