/** Authenticated request state set by the session middleware. */
export interface RequestAuth {
  userId: string;
  sessionId: string;
  /** password | mfa_pending | mfa_verified */
  assurance: 'password' | 'mfa_pending' | 'mfa_verified';
  /** Password accepted but the second factor is outstanding: only /v1/auth/mfa/verify works. */
  pending: boolean;
  createdAt: Date;
  /** Last activity as recorded by the session touch (granularity: SESSION_TOUCH_INTERVAL_MIN). */
  lastSeenAt: Date;
  mfaVerifiedAt: Date | null;
  stepUpAt: Date | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: RequestAuth;
    }
  }
}

export {};
