import { testDefaults } from '@ai-designer/config/vitest';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Requires `pnpm infra:test:up` (compose `test` profile). See docs/plan/07-environment-setup.md.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    ...testDefaults,
    include: [
      'src/**/*.int.test.ts',
      'test/integration/**/*.int.test.ts',
      'test/security/**/*.int.test.ts',
    ],
    globalSetup: ['test/integration/global-setup.ts'],
    setupFiles: ['test/integration/setup-file.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
