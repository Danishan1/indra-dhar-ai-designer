/**
 * Idempotent seed entrypoint. Split into `platform` (permissions, roles, plans, built-in artifacts…)
 * and `dev` (demo org/users/projects) as later iterations add data (docs/plan/02-conventions.md §7).
 */
import { createPrismaClient } from '../../src/client.js';
import { syncAuthorizationCatalog } from '../../src/platform/authorization-catalog.js';

const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');

async function main(): Promise<void> {
  const authz = await syncAuthorizationCatalog(prisma);
  console.warn('[seed] permissions/roles synced', authz);
  await prisma.schemaMeta.upsert({
    where: { key: 'seed.platform' },
    update: { value: 'I07' },
    create: { key: 'seed.platform', value: 'I07' },
  });
  console.warn('[seed] platform seed applied (I07)');
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
