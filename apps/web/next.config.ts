import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { NextConfig } from 'next';

// Load the repository-root .env (shared with api/worker) without overriding real env vars.
const rootEnv = join(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Node-only logging stack (rotating files under logs/web) must not be bundled.
  serverExternalPackages: ['@ai-designer/logger', 'pino', 'pino-pretty', 'pino-roll'],
};

export default nextConfig;
