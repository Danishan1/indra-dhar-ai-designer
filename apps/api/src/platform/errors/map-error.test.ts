import { ErrorCodes, ErrorHttpStatus, errorEnvelopeSchema } from '@ai-designer/contracts';
import { Prisma } from '@ai-designer/db';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError } from './app-error.js';
import { mapError } from './map-error.js';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('SELECT secret FROM table failed', {
    code,
    clientVersion: 'x',
  });

describe('mapError', () => {
  it.each(Object.values(ErrorCodes))(
    'maps AppError %s to its status and a valid envelope',
    (code) => {
      const mapped = mapError(new AppError(code, 'msg'), 'req-1');
      expect(mapped.status).toBe(ErrorHttpStatus[code]);
      expect(errorEnvelopeSchema.parse(mapped.body).error).toMatchObject({
        code,
        requestId: 'req-1',
      });
    },
  );

  it('maps zod errors to VALIDATION_FAILED with issues', () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 1 });
    const mapped = mapError(result.error, 'r');
    expect(mapped.status).toBe(400);
    expect(mapped.body.error.details).toEqual({
      issues: [expect.objectContaining({ path: 'name' })],
    });
  });

  it.each([
    ['P2002', 409, 'CONFLICT'],
    ['P2025', 404, 'NOT_FOUND'],
    ['P2034', 409, 'CONCURRENT_MODIFICATION'],
  ])('maps Prisma %s without leaking SQL', (code, status, errorCode) => {
    const mapped = mapError(prismaError(code), 'r');
    expect(mapped.status).toBe(status);
    expect(mapped.body.error.code).toBe(errorCode);
    expect(JSON.stringify(mapped.body)).not.toContain('SELECT');
  });

  it('maps unknown Prisma and generic errors to INTERNAL_ERROR without details', () => {
    for (const err of [prismaError('P1001'), new Error('db password=hunter2'), 'boom']) {
      const mapped = mapError(err, 'r');
      expect(mapped).toMatchObject({ status: 500, unexpected: true });
      expect(mapped.body.error.message).toBe('Internal server error');
    }
  });

  it('maps Nest HTTP exceptions', () => {
    expect(mapError(new NotFoundException(), 'r').body.error.code).toBe('NOT_FOUND');
    expect(mapError(new ForbiddenException(), 'r').body.error.code).toBe('PERMISSION_DENIED');
    expect(mapError(new BadRequestException('bad'), 'r').body.error.code).toBe('VALIDATION_FAILED');
    expect(mapError(new ServiceUnavailableException(), 'r')).toMatchObject({
      status: 503,
      unexpected: true,
    });
  });

  it('maps body-parser errors', () => {
    expect(mapError({ type: 'entity.too.large', status: 413 }, 'r').status).toBe(413);
    expect(mapError({ type: 'entity.parse.failed', status: 400 }, 'r').body.error.code).toBe(
      'VALIDATION_FAILED',
    );
  });
});
