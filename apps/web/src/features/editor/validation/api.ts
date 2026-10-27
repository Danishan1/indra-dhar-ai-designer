import {
  latestValidationResponseSchema,
  type RunValidationRequest,
  validationRunSchema,
} from '@ai-designer/contracts';

import { apiRequest } from '@/lib/api/client';

/** Design-structure validation runs of one design (I20). */
export function validationApi(orgId: string, designId: string) {
  const base = `/v1/orgs/${encodeURIComponent(orgId)}/designs/${encodeURIComponent(designId)}/validation-runs`;
  return {
    latest: (signal?: AbortSignal) =>
      apiRequest(`${base}/latest?target=working_copy`, {
        schema: latestValidationResponseSchema,
        ...(signal ? { signal } : {}),
      }),
    run: (body: RunValidationRequest = { target: 'working_copy' }) =>
      apiRequest(base, { method: 'POST', body, schema: validationRunSchema }),
  };
}
