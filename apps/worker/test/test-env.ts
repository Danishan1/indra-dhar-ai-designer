import { applyIntegrationEnv, TEST_DATABASE_URL, TEST_REDIS_URL } from '@ai-designer/db/testing';

/** Forces the test-profile infrastructure; override with AID_IT_<KEY> (shell or root .env). */
export function applyTestEnv(): void {
  applyIntegrationEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    LOG_TO_FILE: 'false',
    DATABASE_URL: TEST_DATABASE_URL,
    REDIS_URL: TEST_REDIS_URL,
  });
}
