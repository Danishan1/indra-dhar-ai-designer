/**
 * Dev-only demo of the operation router (I14): applies a few operations to an existing design and
 * prints what happened. Usage:
 *   pnpm --filter @ai-designer/api ops:demo -- <designId or DSN-display-id>
 * Runs as the organization's owner; changes are real (undo them from the design page or commit).
 */
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module.js';
import { AuthorizationService } from '../modules/authorization/authorization.service.js';
import { OperationsService } from '../modules/operations/operations.service.js';
import { AppConfig } from '../platform/config/app-config.js';
import { loadRootEnv } from '../platform/config/load-env.js';
import { PrismaService } from '../platform/prisma/prisma.service.js';

loadRootEnv();
const ref = process.argv.slice(2).find((a) => a !== '--');
if (!ref) {
  console.error('Usage: pnpm --filter @ai-designer/api ops:demo -- <designId | DSN-000001>');
  process.exit(1);
}
const app = await NestFactory.createApplicationContext(
  AppModule.forRoot(AppConfig.fromProcessEnv()),
  {
    logger: ['error', 'warn'],
  },
);
try {
  const prisma = app.get(PrismaService);
  const design = await prisma.design.findFirst({
    where: /^[0-9a-f-]{36}$/i.test(ref) ? { id: ref } : { displayId: ref },
    include: { workingCopy: true },
  });
  if (!design?.workingCopy) throw new Error(`Design ${ref} not found`);
  const owner = await prisma.membership.findFirst({
    where: {
      organizationId: design.organizationId,
      status: 'active',
      roles: { some: { role: { name: 'Owner' } } },
    },
  });
  if (!owner) throw new Error('No active owner in the organization');
  const ctx = await app.get(AuthorizationService).contextFor(design.organizationId, owner.userId);
  if (!ctx) throw new Error('Owner has no access');
  const ops = app.get(OperationsService);
  const state = design.workingCopy.state as {
    components: { componentId: string; componentType: string; side: string }[];
  };
  const sleeve = state.components.find((c) => c.componentType === 'sleeve' && c.side === 'left');
  const body = state.components.find((c) => c.componentType === 'garment_body');
  const lace = await prisma.artifact.findFirst({ where: { platformKey: 'lace.scalloped_border' } });
  let version = design.workingCopy.version;
  const steps: Record<string, unknown>[] = [
    ...(body
      ? [{ type: 'rename_component', componentId: body.componentId, displayName: 'Demo body' }]
      : []),
    ...(sleeve
      ? [
          {
            type: 'set_property',
            componentId: sleeve.componentId,
            key: 'dimension.sleeve_length',
            value: 62,
            unit: 'cm',
          },
        ]
      : []),
    ...(sleeve && lace?.currentRevisionId
      ? [
          {
            type: 'attach_artifact',
            componentId: sleeve.componentId,
            artifactRevisionId: lace.currentRevisionId,
            placement: { region: 'hem' },
          },
        ]
      : []),
  ];
  for (const operation of steps) {
    try {
      const res = await ops.submit(ctx, design.id, { expectedVersion: version, operation });
      version = res.workingCopy.version;
      console.warn(
        `${res.operation.displayId} ${res.operation.operationType} → v${version} via ${res.operation.executionStrategy}` +
          (res.findings.length ? ` (${res.findings.map((f) => f.ruleId).join(', ')})` : ''),
      );
    } catch (e) {
      console.warn(
        `${String(operation.type)} refused: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
} finally {
  await app.close();
}
