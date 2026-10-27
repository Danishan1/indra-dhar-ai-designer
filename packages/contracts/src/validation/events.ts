import { z } from 'zod';

import { defineEvent } from '../events/envelope.js';

/** I20: a validation run stored new findings for a design (editor polling / SSE later). */
export const ValidationFindingsUpdatedEvent = defineEvent(
  'validation.findings_updated',
  1,
  z.object({
    organizationId: z.uuid(),
    designId: z.uuid(),
    runId: z.uuid(),
    target: z.enum(['working_copy', 'revision']),
    targetVersion: z.number().int(),
    constraintSet: z.string(),
    errors: z.number().int(),
    warnings: z.number().int(),
    manualReview: z.number().int(),
  }),
);
