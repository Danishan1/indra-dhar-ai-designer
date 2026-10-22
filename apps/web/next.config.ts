import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { NextConfig } from 'next';

// Load the repository-root .env (shared with api/worker) without overriding real env vars.
const rootEnv = join(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/**
 * The browser always calls the API same-origin at `/v1/*`; Next.js proxies it to the API server
 * (API_BASE_URL, default http://localhost:4000). Same-origin keeps session cookies first-party (I05)
 * and avoids CORS. Production uses the reverse proxy (Caddy, I48) with the same path layout.
 */
const apiBaseUrl = (process.env.API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  rewrites() {
    return Promise.resolve([{ source: '/v1/:path*', destination: `${apiBaseUrl}/v1/:path*` }]);
  },
  poweredByHeader: false,
  // Bottom-left would cover the sidebar collapse button.
  devIndicators: { position: 'bottom-right' },
  // Node-only logging stack (rotating files under logs/web) must not be bundled.
  serverExternalPackages: ['@ai-designer/logger', 'pino', 'pino-pretty', 'pino-roll'],
};

export default nextConfig;
