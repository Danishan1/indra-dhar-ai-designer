import { isSensitivePermission, type PermissionKey } from '@ai-designer/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';

import { AuditService } from '../audit/audit.service.js';
import '../auth/request-auth.js';
import { RequestContext } from '../context/request-context.js';
import { AppError } from '../errors/app-error.js';

import {
  AUTHORIZER,
  type Authorizer,
  type AuthzContext,
  type AuthzDecision,
} from './authorizer.js';

export interface EnforceInput {
  /** From the route (`:orgId`), or null when the resource names the organization. */
  organizationId: string | null;
  permission?: PermissionKey;
  resource?: { type: string; id: string };
  /** Label for the 404 when the resource is out of reach ("Project not found"). */
  notFoundLabel?: string;
}

/**
 * Turns a PDP decision into "allowed (here is the context)" or the right error. Used by the global
 * guard for the route's declared resource, and by services that must check a SECOND resource named
 * in the body (e.g. the target project when duplicating a design) — same semantics, same errors,
 * same audit of denied sensitive actions.
 */
@Injectable()
export class PolicyEnforcer {
  private readonly logger = new Logger('Authorization');

  constructor(
    @Inject(AUTHORIZER) private readonly authorizer: Authorizer,
    private readonly audit: AuditService,
  ) {}

  async enforce(req: Request, input: EnforceInput): Promise<AuthzContext> {
    const principal = RequestContext.get()?.principal;
    if (principal?.type !== 'human' || !principal.id)
      throw new AppError('UNAUTHENTICATED', 'Sign in to continue');
    const { permission, resource } = input;
    const decision = await this.authorizer.authorize({
      principal,
      organizationId: input.organizationId,
      ...(permission ? { permission } : {}),
      ...(resource ? { resource } : {}),
      ...(req.auth
        ? {
            session: {
              mfaVerified: req.auth.assurance === 'mfa_verified',
              stepUpAt: req.auth.stepUpAt,
              createdAt: req.auth.createdAt,
              lastSeenAt: req.auth.lastSeenAt,
            },
          }
        : {}),
    });

    if (decision.decision === 'allow' && decision.context && decision.obligations.length === 0) {
      return decision.context;
    }
    if (decision.decision === 'allow') {
      // Obligations must be met before the operation runs (FR-SEC-243). The client re-verifies
      // (POST /v1/auth/step-up) and retries.
      const stepUp = decision.obligations.find((o) => o.type === 'step_up');
      throw new AppError('STEP_UP_REQUIRED', 'Confirm it is you to continue', {
        reason: stepUp ? 'stale' : 'obligation',
        method: 'totp',
        ...(stepUp ? { maxAgeMinutes: stepUp.maxAgeMinutes } : {}),
      });
    }
    await this.auditDenial(decision, permission, resource);
    throw this.toError(decision, input.notFoundLabel ?? 'Organization', permission);
  }

  private toError(decision: AuthzDecision, notFoundLabel: string, permission?: string): AppError {
    switch (decision.reasonCode) {
      case 'NOT_AUTHENTICATED':
      case 'ACCOUNT_INACTIVE':
        return new AppError('UNAUTHENTICATED', 'Sign in to continue');
      case 'NO_MEMBERSHIP':
      case 'RESOURCE_NOT_IN_TENANT':
      case 'RESOURCE_RESTRICTED':
        // Never reveal whether another tenant's resource exists (FR-SEC-216/241).
        return AppError.notFound(notFoundLabel);
      case 'MEMBERSHIP_INACTIVE':
        return new AppError(
          'PERMISSION_DENIED',
          'Your membership in this organization is suspended',
          {
            reason: 'membership_suspended',
          },
        );
      case 'MFA_REQUIRED':
        return new AppError(
          'MFA_REQUIRED',
          'Turn on two-step verification to do this in this organization',
          { reason: 'mfa_required' },
        );
      case 'SESSION_POLICY_EXPIRED':
        return new AppError('UNAUTHENTICATED', 'Your session expired. Sign in again.', {
          reason: 'session_policy_expired',
        });
      case 'POLICY_UNAVAILABLE':
        return new AppError(
          'DEPENDENCY_UNAVAILABLE',
          'Access could not be checked right now. Try again shortly.',
        );
      default:
        return new AppError('PERMISSION_DENIED', 'You do not have permission to do that', {
          reason: decision.reasonCode.toLowerCase(),
          ...(permission ? { permission } : {}),
        });
    }
  }

  /** Denials of sensitive actions by members are audited (FR-SEC-178 context, §15.1). */
  private async auditDenial(
    decision: AuthzDecision,
    permission: string | undefined,
    resource: { type: string; id: string } | undefined,
  ): Promise<void> {
    if (!decision.context || !permission) return;
    if (!isSensitivePermission(permission as Parameters<typeof isSensitivePermission>[0])) return;
    try {
      await this.audit.record(
        {
          eventType: 'authorization.denied',
          action: permission,
          outcome: 'denied',
          reasonCode: decision.reasonCode,
          policyVersion: decision.policyVersion,
          ...(resource ? { resourceType: resource.type, resourceId: resource.id } : {}),
        },
        undefined,
        { organizationId: decision.context.organizationId },
      );
    } catch (err) {
      this.logger.warn({ err }, 'failed to audit authorization denial');
    }
  }
}
