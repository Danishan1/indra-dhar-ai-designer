/**
 * Idempotent seed entrypoint. Split into `platform` (permissions, roles, plans, built-in artifacts…)
 * and `dev` (demo org/users/projects) as later iterations add data (docs/plan/02-conventions.md §7).
 */
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  await prisma.schemaMeta.upsert({
    where: { key: 'seed.platform' },
    update: { value: 'I02' },
    create: { key: 'seed.platform', value: 'I02' },
  });
  console.warn('[seed] platform seed applied (I02 baseline)');
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
