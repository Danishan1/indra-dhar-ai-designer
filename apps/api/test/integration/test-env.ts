/**
 * Defaults for integration tests: the isolated compose `test` profile
 * (`pnpm infra:test:up`): postgres :55432, redis :56379, object store :58333.
 */
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://aid:aid_test_password@localhost:55432/ai_designer_test',
  REDIS_URL: 'redis://localhost:56379',
  S3_ENDPOINT: 'http://localhost:58333',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'aid-dev-access-key',
  S3_SECRET_ACCESS_KEY: 'aid-dev-secret-key-change-me',
  S3_FORCE_PATH_STYLE: 'true',
  S3_BUCKET_ORIGINALS: 'aid-test-assets-original',
  S3_BUCKET_DERIVED: 'aid-test-assets-derived',
  S3_BUCKET_EXPORTS: 'aid-test-exports',
};

/**
 * Forces the test-profile values so integration tests can never touch the dev database.
 * Override a single value with AID_IT_<KEY> (e.g. AID_IT_DATABASE_URL in CI).
 */
export function applyTestEnv(): void {
  for (const [key, value] of Object.entries(TEST_ENV)) {
    process.env[key] = process.env[`AID_IT_${key}`] ?? value;
  }
}
