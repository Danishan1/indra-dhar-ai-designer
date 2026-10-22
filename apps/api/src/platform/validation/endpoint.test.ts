import { describe, expect, it } from 'vitest';
import { z, ZodError } from 'zod';

import { ZodValidationPipe } from './endpoint.js';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe({
    summary: 't',
    body: z.object({ name: z.string().trim().min(1) }),
    params: z.object({ id: z.uuid() }),
    query: z.object({ limit: z.coerce.number().int().max(100).default(20) }),
  });

  it('parses and transforms body and query', () => {
    expect(pipe.transform({ name: ' a ' }, { type: 'body' })).toEqual({ name: 'a' });
    expect(pipe.transform({}, { type: 'query' })).toEqual({ limit: 20 });
  });

  it('validates single named params', () => {
    expect(() => pipe.transform('nope', { type: 'param', data: 'id' })).toThrow(ZodError);
  });

  it('rejects invalid bodies and ignores custom params', () => {
    expect(() => pipe.transform({ name: '' }, { type: 'body' })).toThrow(ZodError);
    expect(pipe.transform('x', { type: 'custom' })).toBe('x');
  });
});
