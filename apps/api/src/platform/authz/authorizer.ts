import type {
  Actor,
  AuthzReasonCode,
  BaselineRoleKey,
  PermissionKey,
} from '@ai-designer/contracts';
import type { Request } from 'express';

import { AppError } from '../errors/app-error.js';

/** Bump when decision semantics change (recorded on audited decisions, SPEC-009 §22). */
export const POLICY_VERSION = 'sec-policy-v1';

/** Organization-scoped facts about the caller once membership is verified. */
export interface AuthzContext {
  organizationId: string;
  membershipId: string;
  userId: string;
  roles: BaselineRoleKey[];
  permissions: ReadonlySet<PermissionKey>;
}

export interface AuthzRequest {
  principal: Actor;
  /** From the route (`:orgId`); `null` when the organization comes from the resource. */
  organizationId: string | null;
  /** Omitted = membership only. */
  permission?: PermissionKey;
  resource?: { type: string; id: string };
}

export type Obligation = { type: 'step_up'; reason: string };

export interface AuthzDecision {
  decision: 'allow' | 'deny';
  reasonCode: AuthzReasonCode;
  policyVersion: string;
  obligations: Obligation[];
  /** Set when the caller's membership was resolved (allow, or deny for a missing permission). */
  context?: AuthzContext;
}

/** Policy Decision Point (implemented by the authorization module; fails closed). */
export interface Authorizer {
  authorize(request: AuthzRequest): Promise<AuthzDecision>;
}
export const AUTHORIZER = Symbol('AUTHORIZER');

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authz?: AuthzContext;
    }
  }
}

/** Authorization context set by the guard on member/permission routes. */
export function authzContext(req: Request): AuthzContext {
  if (!req.authz)
    throw new AppError('INTERNAL_ERROR', 'Authorization context missing (route is not org-scoped)');
  return req.authz;
}
