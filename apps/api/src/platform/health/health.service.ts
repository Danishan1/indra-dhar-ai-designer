import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

import { AppConfig } from '../config/app-config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';

export type ComponentStatus = 'ok' | 'down';

export interface ReadinessReport {
  status: 'ok' | 'degraded';
  checks: { database: ComponentStatus; redis: ComponentStatus; objectStorage: ComponentStatus };
  time: string;
}

const CHECK_TIMEOUT_MS = 1000;

async function withTimeout(check: () => Promise<unknown>): Promise<ComponentStatus> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS);
      }),
    ]);
    return 'ok';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class HealthService {
  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /**
   * Readiness of each dependency. Deliberately exposes only ok/down per component — no hostnames,
   * credentials or error messages (docs/plan/iterations/I02 §10).
   */
  async readiness(): Promise<ReadinessReport> {
    const [database, redis, objectStorage] = await Promise.all([
      withTimeout(() => this.prisma.$queryRawUnsafe('SELECT 1')),
      withTimeout(async () => {
        if ((await this.redis.ping()) !== 'PONG') throw new Error('unexpected ping reply');
      }),
      withTimeout(async () => {
        if (!(await this.storage.bucketExists(this.config.storage.buckets.originals))) {
          throw new Error('bucket missing');
        }
      }),
    ]);
    const checks = { database, redis, objectStorage };
    const healthy = Object.values(checks).every((s) => s === 'ok');
    return { status: healthy ? 'ok' : 'degraded', checks, time: new Date().toISOString() };
  }
}
