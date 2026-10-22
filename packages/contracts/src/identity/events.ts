import { z } from 'zod';

import { defineEvent } from '../events/envelope.js';

export const UserRegisteredEvent = defineEvent(
  'identity.user_registered',
  1,
  z.object({ userId: z.uuid() }),
);
export const UserEmailVerifiedEvent = defineEvent(
  'identity.user_email_verified',
  1,
  z.object({ userId: z.uuid() }),
);
export const UserPasswordChangedEvent = defineEvent(
  'identity.user_password_changed',
  1,
  z.object({ userId: z.uuid(), reason: z.enum(['reset', 'change']) }),
);
export const SessionRevokedEvent = defineEvent(
  'identity.session_revoked',
  1,
  z.object({
    userId: z.uuid(),
    sessionId: z.uuid(),
    reason: z.enum(['logout', 'password_reset', 'password_change', 'expired', 'admin']),
  }),
);
