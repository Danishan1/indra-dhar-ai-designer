import {
  type AiEnv,
  type AiOperation,
  AiOperations,
  AiProviderError,
  createAdapter,
  type DiscoveredModel,
  discoverModels,
  FAKE_MODELS,
  healthFrom,
  type ModelPreferences,
  type ModelRef,
  OPERATION_LABELS,
  OPERATION_REQUIREMENTS,
  planChain,
  readAiEnv,
  supports,
} from '@ai-designer/ai';
import type { AiProviderConnection, AiSettings, TestModelResponse } from '@ai-designer/contracts';
import { newId } from '@ai-designer/db';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { AuditService } from '../../platform/audit/audit.service.js';
import type { AuthzContext } from '../../platform/authz/authorizer.js';
import { AppError } from '../../platform/errors/app-error.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';
import { SecretsService } from '../../platform/secrets/secrets.service.js';

type RealProvider = 'gemini' | 'openai';
const REAL: RealProvider[] = ['gemini', 'openai'];
const SERVER_CACHE_MS = 10 * 60_000;

export const providerKeyContext = (organizationId: string, provider: string) =>
  `ai-provider:${organizationId}:${provider}`;

const keyHint = (key: string) => `…${key.slice(-4)}`;

/** A tiny PNG (1×1) for vision probes — no user data leaves the server in a connection test. */
const PROBE_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
    'base64',
  ),
);

/**
 * AI providers and models of an organization (ADR-057): keys saved in Settings (encrypted with
 * SecretsService) or the server's `.env` keys, model discovery through each provider's listing
 * API, per-operation preferences and the order models would be tried in. Owns
 * `ai_provider_connections` and `ai_settings` (the worker reads them to run jobs).
 */
@Injectable()
export class AiCatalogService {
  private readonly logger = new Logger(AiCatalogService.name);
  readonly env: AiEnv = readAiEnv(process.env);
  private readonly serverCache = new Map<
    RealProvider,
    { at: number; models: DiscoveredModel[]; error: string | null }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    private readonly audit: AuditService,
  ) {}

  private serverKey(provider: RealProvider): string {
    return provider === 'gemini' ? this.env.GEMINI_API_KEY : this.env.OPENAI_API_KEY;
  }

  /** Discovery for a `.env` key, cached for 10 minutes (shared by all organizations). */
  private async serverModels(
    provider: RealProvider,
    force = false,
  ): Promise<{ models: DiscoveredModel[]; error: string | null; at: number }> {
    const cached = this.serverCache.get(provider);
    if (cached && !force && Date.now() - cached.at < SERVER_CACHE_MS) return cached;
    let entry: { at: number; models: DiscoveredModel[]; error: string | null };
    try {
      entry = {
        at: Date.now(),
        models: await discoverModels(provider, this.serverKey(provider)),
        error: null,
      };
    } catch (err) {
      entry = { at: Date.now(), models: [], error: (err as Error).message.slice(0, 300) };
      this.logger.warn(
        { provider, error: entry.error },
        'model discovery for the server key failed',
      );
    }
    this.serverCache.set(provider, entry);
    return entry;
  }

  async connections(organizationId: string): Promise<AiProviderConnection[]> {
    const rows = await this.prisma.aiProviderConnection.findMany({ where: { organizationId } });
    const out: AiProviderConnection[] = [];
    for (const provider of REAL) {
      const row = rows.find((r) => r.provider === provider);
      if (row) {
        out.push({
          provider,
          source: 'organization',
          status: row.status as AiProviderConnection['status'],
          keyHint: row.keyHint,
          checkedAt: row.checkedAt?.toISOString() ?? null,
          lastError: row.lastError,
          models: row.models as unknown as DiscoveredModel[],
        });
      } else if (this.serverKey(provider)) {
        const s = await this.serverModels(provider);
        out.push({
          provider,
          source: 'server',
          status: s.error ? (/rejected|denied/.test(s.error) ? 'invalid' : 'error') : 'connected',
          keyHint: keyHint(this.serverKey(provider)),
          checkedAt: new Date(s.at).toISOString(),
          lastError: s.error,
          models: s.models,
        });
      } else
        out.push({
          provider,
          source: 'none',
          status: 'not_configured',
          keyHint: null,
          checkedAt: null,
          lastError: null,
          models: [],
        });
    }
    out.push({
      provider: 'fake',
      source: 'builtin',
      status: 'connected',
      keyHint: null,
      checkedAt: null,
      lastError: null,
      models: FAKE_MODELS,
    });
    return out;
  }

  async catalog(organizationId: string): Promise<DiscoveredModel[]> {
    return (await this.connections(organizationId))
      .filter((c) => c.status === 'connected')
      .flatMap((c) => c.models as DiscoveredModel[]);
  }

  async preferences(
    organizationId: string,
  ): Promise<{ preferences: ModelPreferences; crossProviderFallback: boolean }> {
    const row = await this.prisma.aiSettings.findUnique({ where: { organizationId } });
    return {
      preferences: (row?.preferences as ModelPreferences | undefined) ?? {},
      crossProviderFallback: row?.crossProviderFallback ?? true,
    };
  }

  private async health(organizationId: string) {
    const since = new Date(Date.now() - 24 * 3600_000);
    const rows = await this.prisma.aiUsageRecord.findMany({
      where: { organizationId, createdAt: { gte: since } },
      select: { provider: true, model: true, outcome: true, errorMessage: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return healthFrom(rows);
  }

  /** The models a run would try for an operation, best first. */
  async chain(
    organizationId: string,
    operation: AiOperation,
    provider?: 'gemini' | 'openai' | 'fake' | 'auto',
  ): Promise<ModelRef[]> {
    const [catalog, prefs, health] = await Promise.all([
      this.catalog(organizationId),
      this.preferences(organizationId),
      this.health(organizationId),
    ]);
    return planChain(
      {
        catalog,
        preferences: prefs.preferences,
        provider,
        env: this.env,
        health,
        crossProviderFallback: prefs.crossProviderFallback,
      },
      operation,
    );
  }

  async settings(ctx: AuthzContext): Promise<AiSettings> {
    const [providers, prefs, health] = await Promise.all([
      this.connections(ctx.organizationId),
      this.preferences(ctx.organizationId),
      this.health(ctx.organizationId),
    ]);
    const catalog = providers
      .filter((c) => c.status === 'connected')
      .flatMap((c) => c.models as DiscoveredModel[]);
    return {
      providers,
      preferences: prefs.preferences,
      crossProviderFallback: prefs.crossProviderFallback,
      operations: AiOperations.map((operation) => ({
        operation,
        label: OPERATION_LABELS[operation],
        requirements: [...OPERATION_REQUIREMENTS[operation]],
        compatible: catalog
          .filter((m) => m.provider !== 'fake' && supports(m, operation))
          .map((m) => ({ provider: m.provider, model: m.id })),
        effective: planChain(
          {
            catalog,
            preferences: prefs.preferences,
            env: this.env,
            health,
            crossProviderFallback: prefs.crossProviderFallback,
          },
          operation,
        ),
      })),
      canManage: ctx.permissions.has('credentials.manage'),
    };
  }

  async saveKey(ctx: AuthzContext, provider: RealProvider, apiKey: string) {
    let models: DiscoveredModel[];
    try {
      models = await discoverModels(provider, apiKey);
    } catch (err) {
      const e = err as AiProviderError;
      throw new AppError(
        'VALIDATION_FAILED',
        e.kind === 'auth'
          ? `The ${provider} API key was rejected — check that it is correct and enabled for the Generative Language API.`
          : `Could not check the key: ${e.message}`,
        { issues: [{ path: 'apiKey', message: e.message, code: e.kind ?? 'invalid' }] },
      );
    }
    const data = {
      encryptedKey: this.secrets.encrypt(apiKey, providerKeyContext(ctx.organizationId, provider)),
      keyHint: keyHint(apiKey),
      status: 'connected',
      lastError: null,
      models: models as unknown as object,
      checkedAt: new Date(),
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.aiProviderConnection.upsert({
        where: { organizationId_provider: { organizationId: ctx.organizationId, provider } },
        create: {
          id: newId(),
          organizationId: ctx.organizationId,
          provider,
          createdBy: ctx.userId,
          ...data,
        },
        update: data,
      });
      await this.audit.record(
        {
          eventType: 'ai.provider_key.saved',
          action: 'credentials.manage',
          outcome: 'success',
          resourceType: 'ai_provider',
          resourceId: provider,
          metadata: { provider, models: models.length },
        },
        tx,
      );
    });
    return this.settings(ctx);
  }

  async removeKey(ctx: AuthzContext, provider: RealProvider) {
    await this.prisma.$transaction(async (tx) => {
      await tx.aiProviderConnection.deleteMany({
        where: { organizationId: ctx.organizationId, provider },
      });
      await this.audit.record(
        {
          eventType: 'ai.provider_key.removed',
          action: 'credentials.manage',
          outcome: 'success',
          resourceType: 'ai_provider',
          resourceId: provider,
          metadata: { provider },
        },
        tx,
      );
    });
    return this.settings(ctx);
  }

  /** Re-runs discovery (models change, keys get disabled). */
  async refresh(ctx: AuthzContext, provider: RealProvider) {
    const row = await this.prisma.aiProviderConnection.findUnique({
      where: { organizationId_provider: { organizationId: ctx.organizationId, provider } },
    });
    if (!row) {
      if (this.serverKey(provider)) await this.serverModels(provider, true);
      return this.settings(ctx);
    }
    const key = this.secrets.decrypt(
      row.encryptedKey,
      providerKeyContext(ctx.organizationId, provider),
    );
    try {
      const models = await discoverModels(provider, key);
      await this.prisma.aiProviderConnection.update({
        where: { id: row.id },
        data: {
          status: 'connected',
          lastError: null,
          models: models as unknown as object,
          checkedAt: new Date(),
        },
      });
    } catch (err) {
      const e = err as AiProviderError;
      await this.prisma.aiProviderConnection.update({
        where: { id: row.id },
        data: {
          status: e.kind === 'auth' ? 'invalid' : 'error',
          lastError: e.message.slice(0, 300),
          checkedAt: new Date(),
        },
      });
    }
    return this.settings(ctx);
  }

  async updateSettings(
    ctx: AuthzContext,
    body: { preferences: ModelPreferences; crossProviderFallback: boolean },
  ) {
    const catalog = await this.catalog(ctx.organizationId);
    for (const [op, pref] of Object.entries(body.preferences)) {
      if (!pref || pref === 'auto') continue;
      const m = catalog.find((x) => x.provider === pref.provider && x.id === pref.model);
      if (!m || !supports(m, op as AiOperation))
        throw new AppError(
          'VALIDATION_FAILED',
          `${pref.model} cannot be used for ${OPERATION_LABELS[op as AiOperation]}`,
          {
            issues: [
              {
                path: `preferences.${op}`,
                message: 'Model not available or not compatible',
                code: 'incompatible_model',
              },
            ],
          },
        );
    }
    await this.prisma.aiSettings.upsert({
      where: { organizationId: ctx.organizationId },
      create: {
        organizationId: ctx.organizationId,
        preferences: body.preferences as object,
        crossProviderFallback: body.crossProviderFallback,
        updatedBy: ctx.userId,
      },
      update: {
        preferences: body.preferences as object,
        crossProviderFallback: body.crossProviderFallback,
        updatedBy: ctx.userId,
      },
    });
    return this.settings(ctx);
  }

  /** Decrypted key for a provider (organization key first, then the server key). Server-only. */
  async keyFor(organizationId: string, provider: RealProvider): Promise<string | null> {
    const row = await this.prisma.aiProviderConnection.findUnique({
      where: { organizationId_provider: { organizationId, provider } },
    });
    if (row)
      return this.secrets.decrypt(row.encryptedKey, providerKeyContext(organizationId, provider));
    return this.serverKey(provider) || null;
  }

  /**
   * Compatibility test of one model for one operation: listed by the provider, has the required
   * capabilities, and (for text/vision operations) answers a tiny structured request. Image
   * generation is checked from the listing only — a test image would cost money.
   */
  async test(
    ctx: AuthzContext,
    provider: 'gemini' | 'openai' | 'fake',
    body: { operation: AiOperation; model: string },
  ): Promise<TestModelResponse> {
    const started = Date.now();
    const checks: TestModelResponse['checks'] = [];
    const catalog = (await this.connections(ctx.organizationId)).find(
      (c) => c.provider === provider,
    );
    const model = (catalog?.models as DiscoveredModel[] | undefined)?.find(
      (m) => m.id === body.model,
    );
    checks.push({
      name: 'Listed for this key',
      ok: !!model,
      detail: model
        ? `${model.displayName} (${model.stage})`
        : `${body.model} is not in the provider's model list for this key`,
    });
    const capable = !!model && supports(model, body.operation);
    checks.push({
      name: 'Has the required capabilities',
      ok: capable,
      detail: `${OPERATION_REQUIREMENTS[body.operation].join(', ')}${model ? ` — model offers ${model.capabilities.join(', ') || 'none we can use'}` : ''}`,
    });
    if (capable && body.operation !== 'image_generation') {
      try {
        const key = provider === 'fake' ? 'fake' : await this.keyFor(ctx.organizationId, provider);
        if (!key) throw new AiProviderError('not_configured', 'No API key', provider);
        const adapter = createAdapter({ provider, model: body.model }, key, this.env, {
          garment_decomposition: () => ({ ok: true }),
        });
        const vision = OPERATION_REQUIREMENTS[body.operation].includes('vision');
        await adapter.generateStructured({
          task: 'garment_decomposition',
          system: 'You are a connectivity check.',
          prompt: 'Reply with {"ok": true}.',
          images: vision ? [{ mediaType: 'image/png', data: PROBE_PNG, label: 'test' }] : [],
          schema: z.object({ ok: z.boolean() }),
          shapeHint: '{"ok": true}',
          temperature: 0,
        });
        checks.push({
          name: 'Live request',
          ok: true,
          detail: vision ? 'Image + JSON answer received' : 'JSON answer received',
        });
      } catch (err) {
        checks.push({
          name: 'Live request',
          ok: false,
          detail: (err as Error).message.slice(0, 300),
        });
      }
    }
    return {
      ok: checks.every((c) => c.ok),
      provider,
      model: body.model,
      operation: body.operation,
      checks,
      latencyMs: Date.now() - started,
    };
  }
}
