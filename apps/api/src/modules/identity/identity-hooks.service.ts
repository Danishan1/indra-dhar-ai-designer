import {
  UserEmailVerifiedEvent,
  UserPasswordChangedEvent,
  UserRegisteredEvent,
} from '@ai-designer/contracts';
import type { WriteMeta } from '@ai-designer/db';
import { Injectable, Logger } from '@nestjs/common';

import { AuditService } from '../../platform/audit/audit.service.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';

import { AccountService } from './account.service.js';
import type { AuthHooks } from './better-auth.js';
import { IdentityMailService } from './identity-mail.service.js';
import {
  EMAIL_VERIFICATION_TTL_MS,
  VerificationTokenService,
} from './verification-token.service.js';

const asUser = (userId: string): Partial<WriteMeta> => ({ actor: { type: 'human', id: userId } });

/**
 * Reactions to Better Auth lifecycle callbacks: tokens, emails, audit (§15.1) and outbox events.
 * Better Auth commits its own writes; these records follow immediately (ADR-006 notes).
 * Email delivery failures are logged, never surfaced (responses stay generic).
 */
@Injectable()
export class IdentityHooksService implements AuthHooks {
  private readonly logger = new Logger('Identity');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly tokens: VerificationTokenService,
    private readonly mail: IdentityMailService,
    private readonly accounts: AccountService,
  ) {}

  private async deliver(kind: string, userId: string, send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (err) {
      this.logger.error({ err, userId, kind }, 'identity email could not be sent');
    }
  }

  async onUserCreated(user: { id: string; email: string; displayName: string }): Promise<void> {
    const token = await this.tokens.issue('email-verification', user.id, EMAIL_VERIFICATION_TTL_MS);
    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(
        {
          eventType: 'identity.user.registered',
          action: 'user.register',
          outcome: 'success',
          resourceType: 'user',
          resourceId: user.id,
        },
        tx,
        asUser(user.id),
      );
      await this.outbox.append(tx, UserRegisteredEvent, { userId: user.id }, asUser(user.id));
    });
    await this.deliver('verification', user.id, () =>
      this.mail.sendVerification(user.email, user.displayName, token),
    );
  }

  async onExistingUserSignUp(user: {
    id: string;
    email: string;
    displayName: string;
  }): Promise<void> {
    await this.audit.record(
      {
        eventType: 'identity.user.register_existing',
        action: 'user.register',
        outcome: 'denied',
        reasonCode: 'email_in_use',
        resourceType: 'user',
        resourceId: user.id,
      },
      undefined,
      asUser(user.id),
    );
    await this.deliver('existing-account', user.id, () =>
      this.mail.sendExistingAccountNotice(user.email, user.displayName),
    );
  }

  async sendResetPassword(
    user: { id: string; email: string; displayName: string },
    token: string,
  ): Promise<void> {
    await this.audit.record(
      {
        eventType: 'identity.password.reset_requested',
        action: 'password.reset.request',
        outcome: 'success',
        resourceType: 'user',
        resourceId: user.id,
      },
      undefined,
      asUser(user.id),
    );
    await this.deliver('password-reset', user.id, () =>
      this.mail.sendPasswordReset(user.email, user.displayName, token),
    );
  }

  async onPasswordReset(user: { id: string }): Promise<void> {
    await this.accounts.clearLockout(user.id);
    await this.prisma.$transaction(async (tx) => {
      // The reset link proves control of the mailbox, so a still-unverified account becomes active.
      const activated = await tx.user.updateMany({
        where: { id: user.id, status: 'pending_verification' },
        data: { status: 'active', emailVerified: true, emailVerifiedAt: new Date() },
      });
      await this.audit.record(
        {
          eventType: 'identity.password.reset',
          action: 'password.reset',
          outcome: 'success',
          resourceType: 'user',
          resourceId: user.id,
          metadata: { sessionsRevoked: 'all', emailVerifiedByReset: activated.count > 0 },
        },
        tx,
        asUser(user.id),
      );
      await this.outbox.append(
        tx,
        UserPasswordChangedEvent,
        { userId: user.id, reason: 'reset' },
        asUser(user.id),
      );
      if (activated.count > 0)
        await this.outbox.append(tx, UserEmailVerifiedEvent, { userId: user.id }, asUser(user.id));
    });
  }
}
