import {
  type SizeChartInput,
  sizeChartInputSchema,
  sizeChartListResponseSchema,
  sizeChartSchema,
} from '@ai-designer/contracts';

import { apiRequest } from '@/lib/api/client';

const base = (orgId: string) => `/v1/orgs/${encodeURIComponent(orgId)}/size-charts`;
const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

/** Organization size charts (ADR-067). */
export const sizeChartsApi = {
  list: (orgId: string, signal?: AbortSignal) =>
    apiRequest(base(orgId), { schema: sizeChartListResponseSchema, ...withSignal(signal) }),
  create: (orgId: string, body: SizeChartInput) =>
    apiRequest(base(orgId), {
      method: 'POST',
      body: sizeChartInputSchema.parse(body),
      schema: sizeChartSchema,
      idempotencyKey: globalThis.crypto.randomUUID(),
    }),
  update: (orgId: string, id: string, body: SizeChartInput) =>
    apiRequest(`${base(orgId)}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: sizeChartInputSchema.parse(body),
      schema: sizeChartSchema,
    }),
  remove: (orgId: string, id: string) =>
    apiRequest(`${base(orgId)}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
