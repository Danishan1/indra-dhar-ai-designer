import {
  type AiOperationKey,
  aiSettingsSchema,
  aiStatusSchema,
  analysisSchema,
  type CreateAnalysisRequest,
  createAnalysisRequestSchema,
  type CreateDesignFromAnalysisRequest,
  createDesignFromAnalysisRequestSchema,
  createDesignFromAnalysisResponseSchema,
  type CreateLookRequest,
  createLookRequestSchema,
  type CreateTechPackRequest,
  lookListResponseSchema,
  lookSchema,
  createTechPackRequestSchema,
  techPackListResponseSchema,
  techPackSchema,
  techPackSummarySchema,
  testModelResponseSchema,
} from '@ai-designer/contracts';

import { apiRequest } from '@/lib/api/client';

const org = (orgId: string) => `/v1/orgs/${encodeURIComponent(orgId)}`;
const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

/** AI studio (ADR-056): analyzer, design from analysis, tech packs. Keys never leave the API. */
type Pref = 'auto' | { provider: 'gemini' | 'openai' | 'fake'; model: string };

export const aiSettingsApi = {
  get: (orgId: string, signal?: AbortSignal) =>
    apiRequest(`${org(orgId)}/ai/settings`, { schema: aiSettingsSchema, ...withSignal(signal) }),
  update: (
    orgId: string,
    body: { preferences: Partial<Record<AiOperationKey, Pref>>; crossProviderFallback: boolean },
  ) => apiRequest(`${org(orgId)}/ai/settings`, { method: 'PUT', body, schema: aiSettingsSchema }),
  saveKey: (orgId: string, provider: 'gemini' | 'openai', apiKey: string) =>
    apiRequest(`${org(orgId)}/ai/providers/key`, {
      method: 'PUT',
      body: { provider, apiKey },
      schema: aiSettingsSchema,
    }),
  removeKey: (orgId: string, provider: 'gemini' | 'openai') =>
    apiRequest(`${org(orgId)}/ai/providers/key/remove`, {
      method: 'POST',
      body: { provider },
      schema: aiSettingsSchema,
    }),
  refresh: (orgId: string, provider: 'gemini' | 'openai') =>
    apiRequest(`${org(orgId)}/ai/providers/refresh`, {
      method: 'POST',
      body: { provider },
      schema: aiSettingsSchema,
    }),
  test: (
    orgId: string,
    provider: 'gemini' | 'openai' | 'fake',
    body: { operation: AiOperationKey; model: string },
  ) =>
    apiRequest(`${org(orgId)}/ai/models/test`, {
      method: 'POST',
      body: { provider, ...body },
      schema: testModelResponseSchema,
    }),
};

export const studioApi = {
  aiStatus: (orgId: string, signal?: AbortSignal) =>
    apiRequest(`${org(orgId)}/ai/status`, { schema: aiStatusSchema, ...withSignal(signal) }),
  createAnalysis: (
    orgId: string,
    projectId: string,
    body: CreateAnalysisRequest,
    idempotencyKey: string,
  ) =>
    apiRequest(`${org(orgId)}/projects/${encodeURIComponent(projectId)}/analyses`, {
      method: 'POST',
      body: createAnalysisRequestSchema.parse(body),
      schema: analysisSchema,
      idempotencyKey,
    }),
  analysis: (orgId: string, analysisId: string, signal?: AbortSignal) =>
    apiRequest(`${org(orgId)}/analyses/${encodeURIComponent(analysisId)}`, {
      schema: analysisSchema,
      ...withSignal(signal),
    }),
  createDesign: (
    orgId: string,
    analysisId: string,
    body: CreateDesignFromAnalysisRequest,
    idempotencyKey: string,
  ) =>
    apiRequest(`${org(orgId)}/analyses/${encodeURIComponent(analysisId)}/design`, {
      method: 'POST',
      body: createDesignFromAnalysisRequestSchema.parse(body),
      schema: createDesignFromAnalysisResponseSchema,
      idempotencyKey,
    }),
  createTechPack: (
    orgId: string,
    designId: string,
    body: CreateTechPackRequest,
    idempotencyKey: string,
  ) =>
    apiRequest(`${org(orgId)}/designs/${encodeURIComponent(designId)}/techpacks`, {
      method: 'POST',
      body: createTechPackRequestSchema.parse(body),
      schema: techPackSummarySchema,
      idempotencyKey,
    }),
  createLook: (orgId: string, designId: string, body: CreateLookRequest, idempotencyKey: string) =>
    apiRequest(`${org(orgId)}/designs/${encodeURIComponent(designId)}/looks`, {
      method: 'POST',
      body: createLookRequestSchema.parse(body),
      schema: lookSchema,
      idempotencyKey,
    }),
  looks: (orgId: string, designId: string, signal?: AbortSignal) =>
    apiRequest(`${org(orgId)}/designs/${encodeURIComponent(designId)}/looks`, {
      schema: lookListResponseSchema,
      ...withSignal(signal),
    }),
  techPacks: (orgId: string, designId: string, signal?: AbortSignal) =>
    apiRequest(`${org(orgId)}/designs/${encodeURIComponent(designId)}/techpacks`, {
      schema: techPackListResponseSchema,
      ...withSignal(signal),
    }),
  reprintPdf: (orgId: string, techPackId: string) =>
    apiRequest(`${org(orgId)}/techpacks/${encodeURIComponent(techPackId)}/pdf`, {
      method: 'POST',
      schema: techPackSummarySchema,
      idempotencyKey: globalThis.crypto.randomUUID(),
    }),
  techPack: (orgId: string, techPackId: string, signal?: AbortSignal) =>
    apiRequest(`${org(orgId)}/techpacks/${encodeURIComponent(techPackId)}`, {
      schema: techPackSchema,
      ...withSignal(signal),
    }),
};
