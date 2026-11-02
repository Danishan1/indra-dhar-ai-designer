import { type AiEnv, type AiOperation, OPERATION_LABELS, readAiEnv } from '@ai-designer/ai';
import type { AiStatus } from '@ai-designer/contracts';
import { Injectable } from '@nestjs/common';

import type { AuthzContext } from '../../platform/authz/authorizer.js';
import { AppError } from '../../platform/errors/app-error.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';

import { AiCatalogService } from './ai-catalog.service.js';

/**
 * AI provider status and the simple preflight used until metering (ADR-056, I24): a per-day request
 * cap per organization, counted from `ai_usage_records` (failed and unknown outcomes count too —
 * `outcome_unknown` is never free). Owns `ai_usage_records`; the worker appends to it.
 */
@Injectable()
export class AiUsageService {
  readonly env: AiEnv = readAiEnv(process.env);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: AiCatalogService,
  ) {}

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
    const connections = await this.catalog.connections(ctx.organizationId);
    const providers = await Promise.all(
      connections.map(async (c) => {
        const [text, image] = await Promise.all([
          this.catalog.chain(ctx.organizationId, 'garment_reconstruction', c.provider),
          this.catalog.chain(ctx.organizationId, 'image_generation', c.provider),
        ]);
        const own = (chain: { provider: string; model: string }[]) =>
          chain.find((r) => r.provider === c.provider)?.model ?? '—';
        return {
          name: c.provider,
          configured: c.status === 'connected' && own(text) !== '—',
          models: { text: own(text), image: own(image) },
        };
      }),
    );
    return {
      defaultProvider: await this.defaultProvider(ctx.organizationId),
      providers,
      dailyLimit: this.env.AI_DAILY_REQUEST_LIMIT,
      usedToday: await this.usedToday(ctx.organizationId),
    };
  }

  /** `.env` AI_PROVIDER when it is connected, else the first connected real provider, else fake. */
  private async defaultProvider(organizationId: string): Promise<'gemini' | 'openai' | 'fake'> {
    const connected = (await this.catalog.connections(organizationId))
      .filter((c) => c.status === 'connected')
      .map((c) => c.provider);
    if (connected.includes(this.env.AI_PROVIDER)) return this.env.AI_PROVIDER;
    return connected.find((p) => p !== 'fake') ?? 'fake';
  }

  /**
   * Checks there is a compatible model for every operation the run needs and that today's
   * allowance is not used up; returns the provider the run starts with.
   */
  async preflight(
    ctx: AuthzContext,
    requested: 'gemini' | 'openai' | 'fake' | undefined,
    expectedCalls: number,
    operations: readonly AiOperation[] = ['garment_reconstruction'],
  ): Promise<'gemini' | 'openai' | 'fake'> {
    const name = requested ?? (await this.defaultProvider(ctx.organizationId));
    for (const op of operations) {
      const chain = await this.catalog.chain(ctx.organizationId, op, name);
      if (chain.length === 0)
        throw new AppError(
          'UNSUPPORTED_CAPABILITY',
          name === 'fake'
            ? 'The demo provider is not available'
            : `No ${name} model available for ${OPERATION_LABELS[op].toLowerCase()} — add or check the ${name} API key in Settings → AI`,
          { provider: name, operation: op },
        );
    }
    const used = await this.usedToday(ctx.organizationId);
    if (used + expectedCalls > this.env.AI_DAILY_REQUEST_LIMIT)
      throw new AppError('QUOTA_EXCEEDED', 'Today’s AI request allowance is used up', {
        dailyLimit: this.env.AI_DAILY_REQUEST_LIMIT,
        usedToday: used,
      });
    return name;
  }
}
