import 'reflect-metadata';

import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';

import { AppModule } from '../../src/app.module.js';
import { AppConfig } from '../../src/platform/config/app-config.js';

/** Boots the full API against the test-profile infrastructure on a random port. */
export async function startTestApp(
  overrides: Record<string, string> = {},
): Promise<{ app: INestApplication; baseUrl: string; config: AppConfig }> {
  const config = AppConfig.fromProcessEnv({ ...process.env, ...overrides });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(config)],
  }).compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('v1');
  await app.listen(0);
  return { app, baseUrl: (await app.getUrl()).replace('[::1]', 'localhost'), config };
}
