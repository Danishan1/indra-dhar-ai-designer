import { newId, Prisma } from '@ai-designer/db';
import {
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
  type NestInterceptor,
  RequestMethod,
} from '@nestjs/common';
import { HTTP_CODE_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import type { Request, Response } from 'express';
import { catchError, from, type Observable, of, switchMap, throwError } from 'rxjs';

import { AppConfig } from '../config/app-config.js';
import { RequestContext } from '../context/request-context.js';
import { AppError } from '../errors/app-error.js';
import { PrismaService } from '../prisma/prisma.service.js';

import { requestHash } from './request-hash.js';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
const KEY_RE = /^[\x21-\x7e]{1,255}$/;

type Claim = { kind: 'proceed'; rowId: string } | { kind: 'replay'; status: number; body: unknown };

/**
 * `Idempotency-Key` support (SPEC-006 API-004): the first request with a key executes and its
 * successful response is stored for IDEMPOTENCY_TTL_HOURS; retries with the same key and the same
 * request return the stored response (`Idempotent-Replayed: true`) without executing again; the
 * same key with a different request → 409 IDEMPOTENCY_CONFLICT. Failed executions release the key.
 * Requests without the header execute normally.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Idempotency');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const rawKey = req.headers[IDEMPOTENCY_HEADER];
    if (rawKey === undefined) return next.handle();
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!key || !KEY_RE.test(key)) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Idempotency-Key must be 1-255 printable ASCII characters',
      );
    }

    const handler = context.getHandler();
    const successStatus = this.successStatus(handler);
    const route = `${req.method} ${(req.route as { path?: string } | undefined)?.path ?? req.path}`;
    const ctx = RequestContext.get();
    const principalKey = `${ctx?.principal.type ?? 'anonymous'}:${ctx?.principal.id ?? '-'}:${ctx?.organizationId ?? '-'}`;
    const hash = requestHash({
      method: req.method,
      route,
      body: req.body,
      query: req.query,
      params: req.params,
    });

    return from(this.claim(principalKey, route, key, hash)).pipe(
      switchMap((claim) => {
        if (claim.kind === 'replay') {
          res.setHeader('Idempotent-Replayed', 'true');
          res.status(claim.status);
          return of(claim.body);
        }
        return next.handle().pipe(
          switchMap((body: unknown) =>
            from(
              this.prisma.idempotencyKey.update({
                where: { id: claim.rowId },
                data: {
                  status: 'completed',
                  responseStatus: successStatus,
                  responseBody: (body ?? null) as Prisma.InputJsonValue,
                },
              }),
            ).pipe(switchMap(() => of(body))),
          ),
          catchError((err: unknown) =>
            from(this.release(claim.rowId)).pipe(switchMap(() => throwError(() => err))),
          ),
        );
      }),
    );
  }

  private successStatus(handler: object): number {
    const explicit = Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined;
    if (explicit) return explicit;
    const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
    return method === RequestMethod.POST ? HttpStatus.CREATED : HttpStatus.OK;
  }

  private async claim(
    principalKey: string,
    route: string,
    key: string,
    hash: string,
    retry = true,
  ): Promise<Claim> {
    const ttlMs = this.config.env.IDEMPOTENCY_TTL_HOURS * 3_600_000;
    const rowId = newId();
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          id: rowId,
          principalKey,
          route,
          key,
          requestHash: hash,
          status: 'in_progress',
          expiresAt: new Date(Date.now() + ttlMs),
        },
      });
      return { kind: 'proceed', rowId };
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
    }
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { principalKey_route_key: { principalKey, route, key } },
    });
    if (!existing || existing.expiresAt.getTime() <= Date.now()) {
      if (existing) await this.prisma.idempotencyKey.deleteMany({ where: { id: existing.id } });
      if (retry) return this.claim(principalKey, route, key, hash, false);
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        'Could not claim the idempotency key, retry the request',
      );
    }
    if (existing.requestHash !== hash) {
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency-Key was already used with a different request',
      );
    }
    if (existing.status !== 'completed') {
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        'A request with this Idempotency-Key is still in progress',
      );
    }
    return {
      kind: 'replay',
      status: existing.responseStatus ?? HttpStatus.OK,
      body: existing.responseBody,
    };
  }

  private async release(rowId: string): Promise<void> {
    await this.prisma.idempotencyKey.deleteMany({ where: { id: rowId } }).catch((err: unknown) => {
      this.logger.warn({ err, rowId }, 'Failed to release idempotency key');
    });
  }
}
