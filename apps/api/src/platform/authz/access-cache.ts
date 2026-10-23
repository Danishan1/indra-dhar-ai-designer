import { accessCacheKey } from '@ai-designer/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { REDIS } from '../redis/redis.module.js';

/** Live membership facts used by the PDP (owned by the organizations module). */
export interface MembershipAccess {
  membershipId: string;
  organizationId: string;
  userId: string;
  status: 'active' | 'suspended';
  roleIds: string[];
}

/**
 * Upper bound for a stale authorization decision when an invalidation is lost (NFR-SEC-007 ≤60s).
 * Changes made through the API invalidate immediately (shared Redis → every instance).
 */
export const ACCESS_CACHE_TTL_SECONDS = 30;

const key = accessCacheKey;

/**
 * Short-TTL membership cache. Redis problems never deny or allow anything by themselves: reads
 * fall back to the database and failed writes are ignored.
 */
@Injectable()
export class AccessCache {
  private readonly logger = new Logger('AccessCache');

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async get(organizationId: string, userId: string): Promise<MembershipAccess | null> {
    if (!this.ready()) return null;
    try {
      const raw = await this.withTimeout(this.redis.get(key(organizationId, userId)));
      return raw ? (JSON.parse(raw) as MembershipAccess) : null;
    } catch {
      return null;
    }
  }

  async set(access: MembershipAccess): Promise<void> {
    if (!this.ready()) return;
    try {
      await this.withTimeout(
        this.redis.set(
          key(access.organizationId, access.userId),
          JSON.stringify(access),
          'EX',
          ACCESS_CACHE_TTL_SECONDS,
        ),
      );
    } catch {
      /* cache is best effort */
    }
  }

  /** Call after any change to a membership's status or roles (after the transaction commits). */
  async invalidate(organizationId: string, userId: string): Promise<void> {
    if (!this.ready()) {
      this.logger.warn(
        { organizationId, userId },
        'Redis unavailable; access cache entry expires by TTL',
      );
      return;
    }
    try {
      await this.withTimeout(this.redis.del(key(organizationId, userId)));
    } catch (err) {
      this.logger.warn(
        { err, organizationId, userId },
        'access cache invalidation failed (TTL bounds staleness)',
      );
    }
  }

  /** Never queue commands while Redis is down (the client would buffer them indefinitely). */
  private ready(): boolean {
    return this.redis.status === 'ready';
  }

  private withTimeout<T>(p: Promise<T>): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('redis timeout')), 250)),
    ]);
  }
}
