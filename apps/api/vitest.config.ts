import { testDefaults } from '@ai-designer/config/vitest';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC is required so NestJS decorator metadata (emitDecoratorMetadata) works in tests.
// Unit tests only; integration tests (*.int.test.ts) run via vitest.integration.config.ts.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { ...testDefaults, exclude: [...(testDefaults.exclude ?? []), '**/*.int.test.ts'] },
});
