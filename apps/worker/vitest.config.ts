import { testDefaults } from '@ai-designer/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { ...testDefaults, exclude: [...(testDefaults.exclude ?? []), '**/*.int.test.ts'] },
});
