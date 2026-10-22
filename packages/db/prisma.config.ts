import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig } from 'prisma/config';

// Load the repository-root .env (if present) without overriding real environment variables.
const rootEnv = resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/index.ts',
  },
  datasource: {
    // A placeholder keeps `prisma generate` working on machines without a .env.
    url: process.env.DATABASE_URL ?? 'postgresql://aid:aid_dev_password@localhost:5432/ai_designer',
  },
});
