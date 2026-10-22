import { fileURLToPath } from 'node:url';

import { testDefaults } from '@ai-designer/config/vitest';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Node environment by default; DOM tests opt in with `// @vitest-environment jsdom`.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { ...testDefaults, include: ['src/**/*.test.{ts,tsx}'] },
});
