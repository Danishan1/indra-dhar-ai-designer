'use client';

import type { PermissionKey } from '@ai-designer/contracts';
import type { ReactNode } from 'react';

import { useOrganization } from '@/features/organizations/organization-provider';

/**
 * UI gating by permission in the active organization. Presentational only: hiding a button is a
 * courtesy — the API authorizes every request (docs/architecture/authorization.md).
 */
export function usePermission(permission: PermissionKey): boolean {
  return useOrganization().can(permission);
}

export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: PermissionKey;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return usePermission(permission) ? children : fallback;
}
