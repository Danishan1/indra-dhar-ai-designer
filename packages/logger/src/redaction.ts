/**
 * Paths whose values must never appear in logs (TECH-GDP-001 §3.11, SPEC-009 FR-SEC-174/181).
 * pino wildcards match one level; deeper variants are listed explicitly.
 */
export const REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  '*.password',
  '*.newPassword',
  '*.apiKey',
  '*.secret',
  '*.secretAccessKey',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.*.password',
  '*.*.apiKey',
  '*.*.secret',
  '*.*.token',
];

export const REDACTION_CENSOR = '[REDACTED]';
