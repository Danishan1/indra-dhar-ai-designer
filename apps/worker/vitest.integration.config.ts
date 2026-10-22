import { testDefaults } from '@ai-designer/config/vitest';
import { defineConfig } from 'vitest/config';

// Requires `pnpm infra:test:up` (or AID_IT_* overrides). Shares the test database with the API
// suite, so turbo runs integration suites one at a time (--concurrency=1).
export default defineConfig({
  test: {
    ...testDefaults,
    include: ['src/**/*.int.test.ts', 'test/**/*.int.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup-file.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
