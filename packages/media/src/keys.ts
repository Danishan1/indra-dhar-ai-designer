import type { AssetVariant } from '@ai-designer/contracts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Object key for an asset variant: `org/{orgId}/{yyyy}/{mm}/{assetId}/{variant}` (I09). The
 * organization prefix keeps tenants apart in storage too (AST-009); ids are server-generated UUIDs,
 * never client input, so keys cannot be steered.
 */
export function assetObjectKey(
  organizationId: string,
  assetId: string,
  variant: AssetVariant,
  createdAt: Date,
): string {
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(assetId))
    throw new Error('asset keys need UUID organization and asset ids');
  const yyyy = String(createdAt.getUTCFullYear());
  const mm = String(createdAt.getUTCMonth() + 1).padStart(2, '0');
  return `org/${organizationId}/${yyyy}/${mm}/${assetId}/${variant}`;
}

/** True when `key` lives under the organization's prefix. */
export function keyBelongsTo(organizationId: string, key: string): boolean {
  return key.startsWith(`org/${organizationId}/`);
}
