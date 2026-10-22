/** Keys whose values are replaced before persisting audit metadata / event payloads. */
const SECRET_KEY_RE =
  /pass(word)?|secret|token|api[-_]?key|authorization|cookie|credential|private[-_]?key/i;

export const REDACTED = '[REDACTED]';

/** Deep-copies `value`, replacing values of secret-looking keys (SPEC-009 FR-SEC-174, SPEC-004 EVT-004). */
export function redactSecrets<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v: unknown) => redactSecrets(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY_RE.test(k) ? REDACTED : redactSecrets(v, depth + 1);
  }
  return out as T;
}
