import {
  aiStatusSchema,
  analysisSchema,
  type CreateAnalysisRequest,
  createAnalysisRequestSchema,
  type CreateDesignFromAnalysisRequest,
  createDesignFromAnalysisRequestSchema,
  createDesignFromAnalysisResponseSchema,
  type CreateTechPackRequest,
  createTechPackRequestSchema,
  techPackListResponseSchema,
  techPackSchema,
  techPackSummarySchema,
} from '@ai-designer/contracts';

import { apiRequest } from '@/lib/api/client';

const org = (orgId: string) => `/v1/orgs/${encodeURIComponent(orgId)}`;
const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

/** AI studio (ADR-056): analyzer, design from analysis, tech packs. Keys never leave the API. */
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
  techPacks: (orgId: string, designId: string, signal?: AbortSignal) =>
    apiRequest(`${org(orgId)}/designs/${encodeURIComponent(designId)}/techpacks`, {
      schema: techPackListResponseSchema,
      ...withSignal(signal),
    }),
  techPack: (orgId: string, techPackId: string, signal?: AbortSignal) =>
    apiRequest(`${org(orgId)}/techpacks/${encodeURIComponent(techPackId)}`, {
      schema: techPackSchema,
      ...withSignal(signal),
    }),
};
