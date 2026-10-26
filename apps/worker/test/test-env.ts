import { applyIntegrationEnv, TEST_DATABASE_URL, TEST_REDIS_URL } from '@ai-designer/db/testing';

/** Forces the test-profile infrastructure; override with AID_IT_<KEY> (shell or root .env). */
export function applyTestEnv(): void {
  applyIntegrationEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    LOG_TO_FILE: 'false',
    DATABASE_URL: TEST_DATABASE_URL,
    REDIS_URL: TEST_REDIS_URL,
    S3_ENDPOINT: 'http://localhost:58333',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY_ID: 'aid-dev-access-key',
    S3_SECRET_ACCESS_KEY: 'aid-dev-secret-key-change-me',
    S3_FORCE_PATH_STYLE: 'true',
    S3_BUCKET_ORIGINALS: 'aid-test-assets-original',
    S3_BUCKET_DERIVED: 'aid-test-assets-derived',
    ASSET_SCANNER: 'eicar-test',
  });
}
