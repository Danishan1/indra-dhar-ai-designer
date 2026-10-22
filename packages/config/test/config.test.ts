import { describe, expect, it } from 'vitest';

import eslintConfig, { packageBoundaries, purePackageBoundaries } from '../eslint/index.js';
import prettierConfig from '../prettier/index.js';
import { testDefaults } from '../vitest/preset.js';

describe('@ai-designer/config', () => {
  it('exports a non-empty ESLint flat config', () => {
    expect(Array.isArray(eslintConfig)).toBe(true);
    expect(eslintConfig.length).toBeGreaterThan(0);
  });

  it('defines boundary rules for packages', () => {
    expect(packageBoundaries[0]?.rules?.['no-restricted-imports']).toBeDefined();
    expect(purePackageBoundaries[0]?.rules?.['no-restricted-imports']).toBeDefined();
  });

  it('enforces LF line endings in Prettier', () => {
    expect(prettierConfig.endOfLine).toBe('lf');
  });

  it('provides vitest defaults', () => {
    expect(testDefaults?.include).toContain('src/**/*.{test,spec}.{ts,tsx}');
  });
});
