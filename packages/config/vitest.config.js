import { defineConfig } from 'vitest/config';

import { testDefaults } from './vitest/preset.js';

export default defineConfig({ test: { ...testDefaults } });
