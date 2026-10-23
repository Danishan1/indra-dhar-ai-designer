import {
  DEFAULT_SECURITY_POLICY,
  type SecurityPolicy,
  type SecurityPolicyConfig,
  SecurityPolicyChangedEvent,
  securityPolicyConfigSchema,
} from '@ai-designer/contracts';
import { newId, type TxClient } from '@ai-designer/db';
import { Injectable } from '@nestjs/common';

import { AuditService } from '../../platform/audit/audit.service.js';
import { AppConfig } from '../../platform/config/app-config.js';
import { AppError } from '../../platform/errors/app-error.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';

const CACHE_TTL_MS = 30_000;

interface CurrentPolicy {
  version: number;
  config: SecurityPolicyConfig;
  updatedAt: Date | null;
}

/**
 * Versioned, append-only organization security policy (authorization module). Read by the PDP on
 * every org-scoped decision through a 30 s in-process cache (cleared locally on change; other API
 * instances pick changes up within the TTL).
 */
@Injectable()
export class SecurityPolicyService {
  private readonly cache = new Map<string, { value: CurrentPolicy; at: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /** Called inside the organization-creation transaction. */
  async createDefault(tx: TxClient, organizationId: string, createdBy: string): Promise<void> {
    await tx.securityPolicy.create({
      data: {
        id: newId(),
        organizationId,
        version: 1,
        config: { ...DEFAULT_SECURITY_POLICY },
        createdBy,
      },
    });
  }

  limits() {
    return {
      sessionIdleMinutesMax: this.config.env.SESSION_IDLE_TIMEOUT_MIN,
      sessionAbsoluteHoursMax: this.config.env.SESSION_ABSOLUTE_TIMEOUT_H,
    };
  }

  async current(organizationId: string): Promise<CurrentPolicy> {
    const hit = this.cache.get(organizationId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
    const row = await this.prisma.securityPolicy.findFirst({
      where: { organizationId },
      orderBy: { version: 'desc' },
    });
    // Older rows may miss newer keys: defaults fill the gaps; unknown keys are dropped.
    const parsed = securityPolicyConfigSchema.safeParse({
      ...DEFAULT_SECURITY_POLICY,
      ...((row?.config as Record<string, unknown> | null) ?? {}),
    });
    const value: CurrentPolicy = {
      version: row?.version ?? 1,
      config: parsed.success ? parsed.data : DEFAULT_SECURITY_POLICY,
      updatedAt: row?.createdAt ?? null,
    };
    this.cache.set(organizationId, { value, at: Date.now() });
    return value;
  }

  async view(organizationId: string): Promise<SecurityPolicy> {
    const p = await this.current(organizationId);
    return {
      version: p.version,
      config: p.config,
      updatedAt: p.updatedAt?.toISOString() ?? null,
      limits: this.limits(),
    };
  }

  /** Writes a new version (FR-SEC-053 bounds: orgs can only tighten platform timeouts). */
  async update(
    organizationId: string,
    config: SecurityPolicyConfig,
    actorUserId: string,
  ): Promise<SecurityPolicy> {
    const limits = this.limits();
    const issues: { path: string; message: string; code: string }[] = [];
    const minIdle = this.config.env.SESSION_TOUCH_INTERVAL_MIN + 5;
    if (config.sessionIdleMinutes !== null) {
      if (config.sessionIdleMinutes > limits.sessionIdleMinutesMax)
        issues.push({
          path: 'sessionIdleMinutes',
          message: `At most ${limits.sessionIdleMinutesMax}`,
          code: 'too_big',
        });
      if (config.sessionIdleMinutes < minIdle)
        issues.push({
          path: 'sessionIdleMinutes',
          message: `At least ${minIdle}`,
          code: 'too_small',
        });
    }
    if (
      config.sessionAbsoluteHours !== null &&
      config.sessionAbsoluteHours > limits.sessionAbsoluteHoursMax
    )
      issues.push({
        path: 'sessionAbsoluteHours',
        message: `At most ${limits.sessionAbsoluteHoursMax}`,
        code: 'too_big',
      });
    if (issues.length)
      throw new AppError('VALIDATION_FAILED', 'Policy values are out of range', { issues });

    const before = await this.current(organizationId);
    await this.prisma.$transaction(async (tx) => {
      const latest = await tx.securityPolicy.findFirst({
        where: { organizationId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;
      await tx.securityPolicy.create({
        data: {
          id: newId(),
          organizationId,
          version,
          config: { ...config },
          createdBy: actorUserId,
        },
      });
      const changed = Object.keys(config).filter(
        (k) =>
          config[k as keyof SecurityPolicyConfig] !==
          before.config[k as keyof SecurityPolicyConfig],
      );
      await this.audit.record(
        {
          eventType: 'authorization.security_policy.changed',
          action: 'security_policy.manage',
          outcome: 'success',
          resourceType: 'security_policy',
          resourceId: organizationId,
          metadata: { version, changed, before: before.config, after: config },
        },
        tx,
        { organizationId },
      );
      await this.outbox.append(
        tx,
        SecurityPolicyChangedEvent,
        { organizationId, version },
        { organizationId },
      );
    });
    this.cache.delete(organizationId);
    return this.view(organizationId);
  }
}
