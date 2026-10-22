// Shared Vitest defaults. Workspaces spread this into their own vitest.config.
/** @type {import('vitest/config').UserConfig['test']} */
export const testDefaults = {
  globals: false,
  passWithNoTests: false,
  include: ['src/**/*.{test,spec}.{ts,tsx}', 'test/**/*.{test,spec}.{ts,tsx}'],
  exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
  restoreMocks: true,
};
