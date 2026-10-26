import { z } from 'zod';

import { defineEvent } from '../events/envelope.js';

const ref = { organizationId: z.uuid(), projectId: z.uuid(), designId: z.uuid() };

/** SPEC-006 §15 design events (I12). */
export const DesignCreatedEvent = defineEvent(
  'designs.design_created',
  1,
  z.object({ ...ref, template: z.string(), duplicatedFromDesignId: z.uuid().optional() }),
);
export const WorkingCopySavedEvent = defineEvent(
  'designs.working_copy_saved',
  1,
  z.object({ ...ref, version: z.number().int() }),
);
export const RevisionCommittedEvent = defineEvent(
  'designs.revision_committed',
  1,
  z.object({
    ...ref,
    revisionId: z.uuid(),
    revisionNumber: z.number().int(),
    contentHash: z.string(),
    parentRevisionIds: z.array(z.uuid()),
    restoredFromRevisionId: z.uuid().optional(),
  }),
);
export const RevisionRestoredToWorkingCopyEvent = defineEvent(
  'designs.revision_restored_to_working_copy',
  1,
  z.object({ ...ref, revisionId: z.uuid(), workingCopyVersion: z.number().int() }),
);
