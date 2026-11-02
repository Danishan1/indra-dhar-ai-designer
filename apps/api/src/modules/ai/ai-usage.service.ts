import { type AiEnv, providerStatuses, readAiEnv } from '@ai-designer/ai';
import type { AiStatus } from '@ai-designer/contracts';
import { Injectable } from '@nestjs/common';

import type { AuthzContext } from '../../platform/authz/authorizer.js';
import { AppError } from '../../platform/errors/app-error.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';

/**
 * AI provider status and the simple preflight used until metering (ADR-056, I24): a per-day request
 * cap per organization, counted from `ai_usage_records` (failed and unknown outcomes count too —
 * `outcome_unknown` is never free). Owns `ai_usage_records`; the worker appends to it.
 */
@Injectable()
export class AiUsageService {
  readonly env: AiEnv = readAiEnv(process.env);

  constructor(private readonly prisma: PrismaService) {}

  private startOfDay(): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  async usedToday(organizationId: string): Promise<number> {
    return this.prisma.aiUsageRecord.count({
      where: { organizationId, createdAt: { gte: this.startOfDay() } },
    });
  }

  async status(ctx: AuthzContext): Promise<AiStatus> {
    return {
      defaultProvider: this.env.AI_PROVIDER,
      providers: providerStatuses(this.env),
      dailyLimit: this.env.AI_DAILY_REQUEST_LIMIT,
      usedToday: await this.usedToday(ctx.organizationId),
    };
  }

  /** Resolves the provider to use and checks it is configured and within today's allowance. */
  async preflight(
    ctx: AuthzContext,
    requested: 'gemini' | 'openai' | 'fake' | undefined,
    expectedCalls: number,
  ): Promise<'gemini' | 'openai' | 'fake'> {
    const name = requested ?? this.env.AI_PROVIDER;
    const status = providerStatuses(this.env).find((p) => p.name === name);
    if (!status?.configured)
      throw new AppError(
        'UNSUPPORTED_CAPABILITY',
        `The ${name} AI provider is not configured on this server (add its API key to .env)`,
        { provider: name },
      );
    const used = await this.usedToday(ctx.organizationId);
    if (used + expectedCalls > this.env.AI_DAILY_REQUEST_LIMIT)
      throw new AppError('QUOTA_EXCEEDED', 'Today’s AI request allowance is used up', {
        dailyLimit: this.env.AI_DAILY_REQUEST_LIMIT,
        usedToday: used,
      });
    return name;
  }
}
