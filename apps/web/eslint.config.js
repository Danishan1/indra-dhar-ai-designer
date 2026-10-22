import config, { globals } from '@ai-designer/config/eslint';
import nextPlugin from '@next/eslint-plugin-next';

export default [
  ...config,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
];
