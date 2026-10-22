import config from '@ai-designer/config/eslint';

export default [
  ...config,
  {
    rules: {
      // NestJS relies on runtime class references for DI; type-only imports would break it.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
