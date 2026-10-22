import { fileURLToPath } from 'node:url';

import { testDefaults } from '@ai-designer/config/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { ...testDefaults },
});
