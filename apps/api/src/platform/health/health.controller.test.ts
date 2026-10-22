import { describe, expect, it, vi } from 'vitest';

import { AppConfig } from '../config/app-config.js';

import { HealthController } from './health.controller.js';
import type { HealthService, ReadinessReport } from './health.service.js';

const config = new AppConfig({
  NODE_ENV: 'test',
  APP_VERSION: '1.2.3',
  IDEMPOTENCY_TTL_HOURS: 24,
  API_PORT: 4000,
  APP_BASE_URL: 'http://localhost:3000',
  LOG_LEVEL: 'silent',
  LOG_PRETTY: false,
  LOG_FILE_MAX_SIZE: '10m',
  LOG_FILE_RETENTION: 14,
  DATABASE_URL: 'postgresql://x:y@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'k',
  S3_SECRET_ACCESS_KEY: 's',
  S3_FORCE_PATH_STYLE: true,
  S3_BUCKET_ORIGINALS: 'a',
  S3_BUCKET_DERIVED: 'b',
  S3_BUCKET_EXPORTS: 'c',
  SMTP_URL: 'smtp://localhost:1025',
});

function controllerWith(report: ReadinessReport) {
  const health = { readiness: vi.fn().mockResolvedValue(report) } as unknown as HealthService;
  return new HealthController(config, health);
}

describe('HealthController', () => {
  it('liveness reports ok and version', () => {
    const res = controllerWith({} as ReadinessReport).liveness();
    expect(res).toMatchObject({ status: 'ok', service: 'api', version: '1.2.3' });
  });

  it('readiness returns 503 when degraded', async () => {
    const status = vi.fn();
    const report: ReadinessReport = {
      status: 'degraded',
      checks: { database: 'ok', redis: 'down', objectStorage: 'ok' },
      time: new Date().toISOString(),
    };
    const out = await controllerWith(report).readiness({ status } as never);
    expect(out.status).toBe('degraded');
    expect(status).toHaveBeenCalledWith(503);
  });

  it('readiness keeps 200 when healthy', async () => {
    const status = vi.fn();
    const report: ReadinessReport = {
      status: 'ok',
      checks: { database: 'ok', redis: 'ok', objectStorage: 'ok' },
      time: new Date().toISOString(),
    };
    await controllerWith(report).readiness({ status } as never);
    expect(status).not.toHaveBeenCalled();
  });
});
