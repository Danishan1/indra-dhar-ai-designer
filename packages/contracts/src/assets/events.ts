import { z } from 'zod';

import { defineEvent } from '../events/envelope.js';

const ref = { organizationId: z.uuid(), assetId: z.uuid() };

export const AssetUploadedEvent = defineEvent('assets.asset_uploaded', 1, z.object({ ...ref }));
export const AssetReadyEvent = defineEvent('assets.asset_ready', 1, z.object({ ...ref }));
export const AssetRejectedEvent = defineEvent(
  'assets.asset_rejected',
  1,
  z.object({ ...ref, reason: z.string() }),
);
export const AssetDerivativeCreatedEvent = defineEvent(
  'assets.asset_derivative_created',
  1,
  z.object({ ...ref, derivedAssetId: z.uuid(), variant: z.string() }),
);
export const AssetDeletedEvent = defineEvent('assets.asset_deleted', 1, z.object({ ...ref }));
