import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Module boundary + tenancy check (ADR-004, CLAUDE.md rule 7): Prisma models may only be accessed
 * from their owning module. Tenant tables are then always reached through code that scopes by the
 * verified organization. Add new models here when a module introduces them.
 */
const OWNERS: Record<string, string | string[]> = {
  organization: 'modules/organizations',
  workspace: 'modules/organizations',
  membership: 'modules/organizations',
  membershipRole: 'modules/organizations',
  invitation: 'modules/organizations',
  role: 'modules/authorization',
  permission: 'modules/authorization',
  rolePermission: 'modules/authorization',
  resourceGrant: 'modules/authorization',
  securityPolicy: 'modules/authorization',
  user: 'modules/identity',
  session: 'modules/identity',
  identityCredential: 'modules/identity',
  verificationToken: 'modules/identity',
  mfaFactor: 'modules/identity',
  mfaRecoveryCode: 'modules/identity',
  auditEvent: ['platform/audit', 'modules/audit'],
  asset: 'modules/assets',
  project: 'modules/projects',
  design: 'modules/designs',
  workingCopy: 'modules/designs',
  designRevision: 'modules/designs',
};

const SRC = join(import.meta.dirname, '../..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

describe('table ownership', () => {
  it('Prisma models are only accessed by their owning module', () => {
    const access = new RegExp(`\\b(?:prisma|tx|db)\\.(${Object.keys(OWNERS).join('|')})\\.`, 'g');
    const violations: string[] = [];
    for (const file of files(SRC)) {
      const rel = relative(SRC, file).replaceAll('\\', '/');
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(access)) {
        const model = match[1] ?? '';
        const owners = [OWNERS[model] ?? []].flat();
        if (!owners.some((o) => rel.startsWith(`${o}/`))) violations.push(`${rel}: ${model}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
