import type { Prisma } from '@ai-designer/db';

import type { AuthzContext } from '../../platform/authz/authorizer.js';

/**
 * Artifacts a member may SEE: the platform library, their organization's library and their own
 * private artifacts (FR-SEC-114/115). Platform rows have `organization_id = NULL`, so they must be
 * added explicitly — and ONLY on read/use paths. Write paths use `writableArtifacts`.
 */
export function visibleArtifacts(ctx: AuthzContext): Prisma.ArtifactWhereInput {
  return {
    lifecycleStatus: { not: 'deleted' },
    OR: [
      { ownerScope: 'platform' },
      { ownerScope: 'organization', organizationId: ctx.organizationId },
      { ownerScope: 'user', organizationId: ctx.organizationId, ownerUserId: ctx.userId },
    ],
  };
}

/** Artifacts a member may CHANGE (never platform ones). Role checks happen in the PDP. */
export function writableArtifacts(ctx: AuthzContext): Prisma.ArtifactWhereInput {
  return {
    lifecycleStatus: { not: 'deleted' },
    OR: [
      { ownerScope: 'organization', organizationId: ctx.organizationId },
      { ownerScope: 'user', organizationId: ctx.organizationId, ownerUserId: ctx.userId },
    ],
  };
}
