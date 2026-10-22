import { logEnvSchema } from '@ai-designer/logger';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const port = z.coerce.number().int().min(1).max(65535);

/**
 * API environment schema (docs/plan/07-environment-setup.md §3).
 * Every iteration that introduces configuration adds it here and to .env.example.
 */
export const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_VERSION: z.string().default('0.0.0'),
    API_PORT: port.default(4000),
    APP_BASE_URL: z.url().default('http://localhost:3000'),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),

    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: booleanString.default(true),
    S3_BUCKET_ORIGINALS: z.string().min(3).default('aid-assets-original'),
    S3_BUCKET_DERIVED: z.string().min(3).default('aid-assets-derived'),
    S3_BUCKET_EXPORTS: z.string().min(3).default('aid-exports'),

    SMTP_URL: z.url({ protocol: /^smtps?$/ }).default('smtp://localhost:1025'),
    MAIL_FROM: z.string().min(3).default('AI Designer <no-reply@ai-designer.local>'),

    /** Authentication (I05, ADR-006). Signs session cookies and keys IP hashes — keep secret. */
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, { message: 'must be at least 32 characters (openssl rand -base64 32)' }),
    /**
     * Session cookie `Secure` flag. true → cookie `__Host-aid_session` (works on http://localhost in
     * browsers). Set false only when testing over plain http on a non-localhost host.
     */
    AUTH_COOKIE_SECURE: booleanString.default(true),
    SESSION_IDLE_TIMEOUT_MIN: z.coerce
      .number()
      .int()
      .min(5)
      .default(7 * 24 * 60),
    SESSION_ABSOLUTE_TIMEOUT_H: z.coerce
      .number()
      .int()
      .min(1)
      .default(30 * 24),
    /** How often an active session's idle expiry is extended (throttles writes). */
    SESSION_TOUCH_INTERVAL_MIN: z.coerce.number().int().min(1).default(60),
    AUTH_LOCKOUT_THRESHOLD: z.coerce.number().int().min(3).default(5),
    AUTH_LOCKOUT_MINUTES: z.coerce.number().int().min(1).default(15),
    /** Browser origins allowed to send cookie-authenticated mutations (CSRF). Defaults to APP_BASE_URL. */
    AUTH_TRUSTED_ORIGINS: z.string().optional(),
    /** Express `trust proxy` (who may set X-Forwarded-For): 'loopback', a CIDR list, or a hop count. */
    TRUST_PROXY: z.string().min(1).default('loopback'),

    /** How long a stored Idempotency-Key response is replayed (I03). */
    IDEMPOTENCY_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
    /** Serve /v1/openapi.json and the /v1/_dev/* example routes (default: on outside production). */
    API_DEV_ROUTES: booleanString.optional(),
  })
  // Logging variables (LOG_LEVEL, LOG_PRETTY, LOG_TO_FILE, LOG_DIR, …) are shared with the worker/web.
  .extend(logEnvSchema.omit({ NODE_ENV: true }).shape);

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export class ConfigValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid API configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigValidationError';
  }
}

/** Parses env vars; throws a readable error listing every invalid/missing key (fail fast). */
export function parseApiEnv(env: NodeJS.ProcessEnv): ApiEnv {
  const result = apiEnvSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}
