import { z } from 'zod';

import { defineEvent } from '../events/envelope.js';

/** I14: a design operation changed a working copy. */
export const DesignOperationCompletedEvent = defineEvent(
  'operations.design_operation_completed',
  1,
  z.object({
    organizationId: z.uuid(),
    projectId: z.uuid(),
    designId: z.uuid(),
    operationId: z.uuid(),
    operationType: z.string(),
    executionStrategy: z.string(),
    resultWorkingCopyVersion: z.number().int(),
  }),
);
