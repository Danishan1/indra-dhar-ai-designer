import { describe, expect, it } from 'vitest';

import { ApiError } from '../api/errors';

import { shouldRetry } from './provider';

describe('query retry policy', () => {
  it('never retries 4xx and retries 5xx/network at most twice', () => {
    expect(shouldRetry(0, new ApiError('NOT_FOUND', 'x', 404, null))).toBe(false);
    expect(shouldRetry(0, new ApiError('INTERNAL_ERROR', 'x', 500, null))).toBe(true);
    expect(shouldRetry(2, new ApiError('DEPENDENCY_UNAVAILABLE', 'x', 0, null))).toBe(false);
  });
});
