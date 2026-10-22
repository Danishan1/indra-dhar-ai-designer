/** Authenticated request state set by the session middleware. */
export interface RequestAuth {
  userId: string;
  sessionId: string;
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
