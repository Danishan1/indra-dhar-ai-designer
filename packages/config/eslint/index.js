// Shared ESLint flat config for the AI Designer monorepo.
// See docs/plan/01-architecture.md §3 (dependency rules) and 02-conventions.md.
import js from '@eslint/js';
import { importX } from 'eslint-plugin-import-x';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export { globals };

const APP_PACKAGES = ['@ai-designer/api', '@ai-designer/web', '@ai-designer/worker'];

/** Base rules for every workspace. */
export const base = tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/node_modules/**',
      '**/next-env.d.ts',
      '**/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'import-x': importX },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'import-x/no-duplicates': 'error',
      'import-x/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', ['sibling', 'index']],
          // App-local alias (`@/…` in apps/web) is internal, not an external scoped package.
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);

/** Shared packages must never import application code. */
export const packageBoundaries = [
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/apps/*',
                '**/apps/**',
                ...APP_PACKAGES,
                ...APP_PACKAGES.map((p) => `${p}/*`),
              ],
              message: 'Packages may not import from apps (docs/plan/01-architecture.md §3).',
            },
          ],
        },
      ],
    },
  },
];

/** Pure domain packages must stay framework- and IO-free. */
export const purePackageBoundaries = [
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/apps/*',
                '**/apps/**',
                ...APP_PACKAGES,
                ...APP_PACKAGES.map((p) => `${p}/*`),
              ],
              message: 'Packages may not import from apps (docs/plan/01-architecture.md §3).',
            },
            {
              group: [
                'react',
                'react-dom',
                'next',
                'next/*',
                '@nestjs/*',
                '@prisma/*',
                'bullmq',
                'ioredis',
              ],
              message:
                'Pure packages must not depend on React, Next.js, NestJS, Prisma or queues (docs/plan/01-architecture.md §3).',
            },
          ],
        },
      ],
    },
  },
];

/** Test files: relax a few rules. */
export const tests = [
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/*.test.tsx', '**/__tests__/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
];

export default [...base, ...tests];
