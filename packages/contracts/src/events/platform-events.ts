import { z } from 'zod';

import { defineEvent } from './envelope.js';

/** Platform-level events (I03). Module events live next to their module contracts. */
export const JobQueuedEvent = defineEvent(
  'job.queued',
  1,
  z.object({ jobId: z.uuid(), kind: z.string(), displayId: z.string() }),
);

export const JobFinishedEvent = defineEvent(
  'job.finished',
  1,
  z.object({
    jobId: z.uuid(),
    kind: z.string(),
    status: z.enum(['succeeded', 'failed', 'cancelled']),
  }),
);

/** Dev-only example event used by the platform-primitives demo endpoint. */
export const DevEchoedEvent = defineEvent(
  'dev.echoed',
  1,
  z.object({ message: z.string().max(500) }),
);
