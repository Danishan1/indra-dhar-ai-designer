import { applyIntegrationEnv, TEST_DATABASE_URL, TEST_REDIS_URL } from '@ai-designer/db/testing';

/**
 * Defaults for integration tests: the isolated compose `test` profile
 * (`pnpm infra:test:up`): postgres :55432, redis :56379, object store :58333.
 */
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  LOG_TO_FILE: 'false',
  DATABASE_URL: TEST_DATABASE_URL,
  REDIS_URL: TEST_REDIS_URL,
  S3_ENDPOINT: 'http://localhost:58333',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'aid-dev-access-key',
  S3_SECRET_ACCESS_KEY: 'aid-dev-secret-key-change-me',
  BETTER_AUTH_SECRET: 'integration-test-secret-integration-test-00',
  // 32 bytes of 0x01 — test-only key.
  SECRETS_MASTER_KEY: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=',
  SMTP_URL: 'smtp://localhost:51025',
  APP_BASE_URL: 'http://localhost:3000',
  S3_FORCE_PATH_STYLE: 'true',
  S3_BUCKET_ORIGINALS: 'aid-test-assets-original',
  S3_BUCKET_DERIVED: 'aid-test-assets-derived',
  S3_BUCKET_EXPORTS: 'aid-test-exports',
};

/**
 * Forces the test-profile values so integration tests can never touch the dev database.
 * Override a single value with AID_IT_<KEY> (shell or root .env), e.g. AID_IT_DATABASE_URL.
 */
export function applyTestEnv(): void {
  applyIntegrationEnv(TEST_ENV);
}
