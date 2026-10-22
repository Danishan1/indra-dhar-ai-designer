import { describe, expect, it } from 'vitest';

import { AppError } from '../errors/app-error.js';

import { assertUpdated, assertVersion } from './assert-version.js';

describe('optimistic concurrency', () => {
  it('passes on matching versions and throws CONCURRENT_MODIFICATION otherwise', () => {
    expect(() => assertVersion(3, 3)).not.toThrow();
    try {
      assertVersion(2, 3);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CONCURRENT_MODIFICATION');
      expect((err as AppError).details).toMatchObject({ expectedVersion: 2, currentVersion: 3 });
    }
    expect(() => assertUpdated(0)).toThrow(AppError);
    expect(() => assertUpdated(1)).not.toThrow();
  });
});
