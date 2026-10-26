import { z } from 'zod';

import { defineEvent } from '../events/envelope.js';

const ref = { organizationId: z.uuid(), projectId: z.uuid() };
const transition = z.object({ ...ref, reason: z.string().optional() });

/** SPEC-006 §15 project lifecycle events. */
export const ProjectCreatedEvent = defineEvent(
  'projects.project_created',
  1,
  z.object({ ...ref, duplicatedFromId: z.uuid().optional() }),
);
export const ProjectMetadataUpdatedEvent = defineEvent(
  'projects.project_metadata_updated',
  1,
  z.object({ ...ref, changedFields: z.array(z.string()) }),
);
export const ProjectVisibilityChangedEvent = defineEvent(
  'projects.project_visibility_changed',
  1,
  z.object({ ...ref, visibility: z.enum(['organization', 'restricted']) }),
);
export const ProjectPlacedOnHoldEvent = defineEvent(
  'projects.project_placed_on_hold',
  1,
  transition,
);
export const ProjectResumedEvent = defineEvent('projects.project_resumed', 1, transition);
export const ProjectCompletedEvent = defineEvent('projects.project_completed', 1, transition);
export const ProjectReopenedEvent = defineEvent('projects.project_reopened', 1, transition);
export const ProjectArchivedEvent = defineEvent('projects.project_archived', 1, transition);
export const ProjectRestoredEvent = defineEvent('projects.project_restored', 1, transition);
export const ProjectDeletedEvent = defineEvent('projects.project_deleted', 1, transition);
