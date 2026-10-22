import { afterAll, describe, expect, it } from 'vitest';

import { PrismaService } from './prisma.service.js';
import { AppConfig } from '../config/app-config.js';

describe('PrismaService (integration)', () => {
  const prisma = new PrismaService(AppConfig.fromProcessEnv());

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('connects and reads/writes the migrated schema', async () => {
    await prisma.schemaMeta.upsert({
      where: { key: 'it.check' },
      update: { value: 'ok' },
      create: { key: 'it.check', value: 'ok' },
    });
    const row = await prisma.schemaMeta.findUnique({ where: { key: 'it.check' } });
    expect(row?.value).toBe('ok');
    expect(row?.updatedAt).toBeInstanceOf(Date);
  });
});
