import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { AppError } from '../errors/app-error.js';
import { REDIS } from '../redis/redis.module.js';

export interface RateLimitRule {
  /** Logical name, e.g. 'auth.login.ip'. */
  name: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counters in Redis (FR-SEC-041/042). Subjects (IP, email) are hashed so keys never
 * hold personal data. Fails closed for auth when Redis is down (DEPENDENCY_UNAVAILABLE), because an
 * unlimited login endpoint is worse than a temporarily unavailable one.
 */
@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  static key(rule: RateLimitRule, subject: string): string {
    const digest = createHash('sha256').update(subject).digest('hex').slice(0, 32);
    return `aid:rl:${rule.name}:${digest}`;
  }

  async hit(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
    const key = RateLimitService.key(rule, subject);
    let count: number;
    let ttl: number;
    try {
      const res = await this.redis
        .multi()
        .incr(key)
        .expire(key, rule.windowSeconds, 'NX')
        .ttl(key)
        .exec();
      count = Number(res?.[0]?.[1] ?? 0);
      ttl = Number(res?.[2]?.[1] ?? rule.windowSeconds);
    } catch {
      throw new AppError('DEPENDENCY_UNAVAILABLE', 'Rate limiter unavailable, try again shortly');
    }
    const retryAfterSeconds = ttl > 0 ? ttl : rule.windowSeconds;
    return {
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds,
    };
  }

  /** Throws RATE_LIMITED (429) when any rule is exceeded. */
  async enforce(checks: { rule: RateLimitRule; subject: string }[]): Promise<void> {
    for (const { rule, subject } of checks) {
      const result = await this.hit(rule, subject);
      if (!result.allowed) {
        throw new AppError('RATE_LIMITED', 'Too many attempts. Please wait and try again.', {
          retryAfterSeconds: result.retryAfterSeconds,
        });
      }
    }
  }

  async reset(rule: RateLimitRule, subject: string): Promise<void> {
    await this.redis.del(RateLimitService.key(rule, subject)).catch(() => undefined);
  }
}
