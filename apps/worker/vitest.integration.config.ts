import { testDefaults } from '@ai-designer/config/vitest';
import { defineConfig } from 'vitest/config';

// Requires `pnpm infra:test:up`.
export default defineConfig({
  test: {
    ...testDefaults,
    include: ['src/**/*.int.test.ts', 'test/**/*.int.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
