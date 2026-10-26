import { AppError } from '../errors/app-error.js';

/**
 * Optimistic concurrency (SPEC-006 API-003). Use with a `version` column:
 *
 * ```ts
 * const { count } = await tx.widget.updateMany({ where: { id, version: expectedVersion }, data: { …, version: { increment: 1 } } });
 * assertUpdated(count, { id, expectedVersion });
 * ```
 */
export function assertVersion(
  expected: number,
  actual: number,
  details: Record<string, unknown> = {},
): void {
  if (expected !== actual) {
    throw new AppError(
      'CONCURRENT_MODIFICATION',
      'The resource was modified by someone else; reload and retry',
      {
        ...details,
        expectedVersion: expected,
        currentVersion: actual,
      },
    );
  }
}

/** For conditional `updateMany` writes: 0 rows updated means the version (or state) moved on. */
export function assertUpdated(count: number, details: Record<string, unknown> = {}): void {
  if (count === 0) {
    throw new AppError(
      'CONCURRENT_MODIFICATION',
      'The resource was modified by someone else; reload and retry',
      details,
    );
  }
}
