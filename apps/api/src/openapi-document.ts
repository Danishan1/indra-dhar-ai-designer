import 'reflect-metadata';

import { fileURLToPath } from 'node:url';

import { AppModule } from './app.module.js';
import { AppConfig } from './platform/config/app-config.js';
import { parseApiEnv } from './platform/config/env.schema.js';
import { buildOpenApiDocument, collectControllers } from './platform/openapi/openapi-builder.js';

/** Committed snapshot (docs/api/openapi.json); a unit test fails when it is stale. */
export const OPENAPI_SNAPSHOT_PATH = fileURLToPath(
  new URL('../../../docs/api/openapi.json', import.meta.url),
);

/**
 * Public OpenAPI document built from controller metadata only (no DI, no infrastructure).
 * Dev-only (`internal`) routes are excluded. Regenerate with `pnpm --filter @ai-designer/api openapi:generate`.
 */
export function buildPublicOpenApiDocument(): Record<string, unknown> {
  const config = new AppConfig(
    parseApiEnv({
      NODE_ENV: 'development',
      APP_VERSION: '0.0.0',
      DATABASE_URL: 'postgresql://openapi:openapi@localhost:5432/openapi',
      REDIS_URL: 'redis://localhost:6379',
      S3_ENDPOINT: 'http://localhost:8333',
      S3_ACCESS_KEY_ID: 'openapi',
      S3_SECRET_ACCESS_KEY: 'openapi',
    }),
  );
  return buildOpenApiDocument(collectControllers(AppModule.forRoot(config)), { version: 'v1' });
}

export function serializeOpenApi(doc: Record<string, unknown>): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
