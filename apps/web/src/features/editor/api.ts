import {
  editorStateSchema,
  type EditorState,
  type SubmitOperationResponse,
  submitOperationResponseSchema,
} from '@ai-designer/contracts';
import type { ClientOperation } from '@ai-designer/design-operations';

import { apiRequest } from '@/lib/api/client';

const design = (orgId: string, designId: string) =>
  `/v1/orgs/${encodeURIComponent(orgId)}/designs/${encodeURIComponent(designId)}`;

/** What the editor store needs from the server (injected, so tests can fake it). */
export interface EditorApi {
  loadState(signal?: AbortSignal): Promise<EditorState>;
  submit(
    body: { expectedVersion: number; operation: ClientOperation },
    idempotencyKey: string,
  ): Promise<SubmitOperationResponse>;
}

export function editorApi(orgId: string, designId: string): EditorApi {
  return {
    loadState: (signal) =>
      apiRequest(`${design(orgId, designId)}/editor-state`, {
        schema: editorStateSchema,
        ...(signal ? { signal } : {}),
      }),
    submit: (body, idempotencyKey) =>
      apiRequest(`${design(orgId, designId)}/operations`, {
        method: 'POST',
        body,
        schema: submitOperationResponseSchema,
        idempotencyKey,
      }),
  };
}
