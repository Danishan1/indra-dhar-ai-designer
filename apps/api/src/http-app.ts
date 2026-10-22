import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

import type { AppConfig } from './platform/config/app-config.js';

/**
 * HTTP settings shared by main.ts and the integration-test app factory.
 * `trust proxy`: only the configured proxies (default loopback = the Next.js dev proxy / local
 * reverse proxy) may set X-Forwarded-For, so `req.ip` (rate limits, session IP hash) is the real
 * client and cannot be spoofed by remote callers.
 */
export function configureHttpApp(app: INestApplication, config: AppConfig): void {
  (app as NestExpressApplication).set('trust proxy', config.env.TRUST_PROXY);
  app.setGlobalPrefix('v1');
}
