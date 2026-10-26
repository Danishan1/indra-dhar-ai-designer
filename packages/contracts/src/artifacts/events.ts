import { z } from 'zod';

import { defineEvent } from '../events/envelope.js';

const ref = { organizationId: z.uuid(), artifactId: z.uuid() };

/** Artifact registry events (I13). Platform library changes are not tenant events. */
export const ArtifactCreatedEvent = defineEvent(
  'artifacts.artifact_created',
  1,
  z.object({
    ...ref,
    scope: z.enum(['organization', 'user']),
    derivedFromArtifactRevisionId: z.uuid().optional(),
  }),
);
export const ArtifactRevisionCreatedEvent = defineEvent(
  'artifacts.artifact_revision_created',
  1,
  z.object({ ...ref, artifactRevisionId: z.uuid(), revisionNumber: z.number().int() }),
);
export const ArtifactDeactivatedEvent = defineEvent(
  'artifacts.artifact_deactivated',
  1,
  z.object(ref),
);
export const ArtifactReactivatedEvent = defineEvent(
  'artifacts.artifact_reactivated',
  1,
  z.object(ref),
);
export const ArtifactPublishedEvent = defineEvent('artifacts.artifact_published', 1, z.object(ref));
export const ArtifactDeletedEvent = defineEvent('artifacts.artifact_deleted', 1, z.object(ref));
