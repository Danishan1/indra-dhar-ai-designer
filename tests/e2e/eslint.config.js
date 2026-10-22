import config from '@ai-designer/config/eslint';

export default [...config, { ignores: ['test-results/**', 'playwright-report/**'] }];
