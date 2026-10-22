'use client';

import { toast } from 'sonner';

import { friendlyMessage, toApiError } from './errors';

/** Shows a friendly toast for an API error, with the request id available for support. */
export function toastApiError(err: unknown, title?: string): void {
  const error = toApiError(err);
  const description = error.requestId ? `Reference: ${error.requestId}` : undefined;
  toast.error(title ?? friendlyMessage(error.code), {
    ...(description ? { description } : {}),
    ...(error.requestId
      ? {
          action: {
            label: 'Copy reference',
            onClick: () => void navigator.clipboard?.writeText(error.requestId ?? ''),
          },
        }
      : {}),
  });
}
