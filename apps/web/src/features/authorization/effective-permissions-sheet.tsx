'use client';

import {
  type Member,
  OrgRoleLabels,
  PERMISSION_CATALOG,
  type PermissionKey,
  permissionParts,
} from '@ai-designer/contracts';
import { useQuery } from '@tanstack/react-query';

import { ErrorState, LoadingState } from '@/components/states/states';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { orgsApi } from '@/features/organizations/api';
import { useOrganization } from '@/features/organizations/organization-provider';
import { RoleBadges } from '@/features/organizations/status-badges';
import { queryKeys } from '@/lib/query/keys';

const RESOURCE_LABELS: Record<string, string> = {
  organization: 'Organization',
  members: 'Members',
  roles: 'Roles',
  security_policy: 'Security policy',
  audit: 'Audit',
  api_tokens: 'API tokens',
  notifications: 'Notifications',
  project: 'Projects',
  asset: 'Assets',
  design: 'Designs',
  review: 'Reviews',
  artifact: 'Library artifacts',
  operation: 'Editor operations',
  job: 'Jobs',
  validation: 'Validation',
  techpack: 'Tech packs',
  usage: 'Usage',
  billing: 'Billing',
  budget: 'Budgets',
  credentials: 'Provider credentials',
};

/** Effective permissions of one member, grouped by resource, with the roles that grant each. */
export function EffectivePermissionsSheet({
  member,
  open,
  onOpenChange,
}: {
  member: Member;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { active } = useOrganization();
  const query = useQuery({
    queryKey: queryKeys.org(active.id).effectivePermissions(member.membershipId),
    queryFn: ({ signal }) => orgsApi.effectivePermissions(active.id, member.membershipId, signal),
    enabled: open,
  });
  const groups = new Map<string, { key: PermissionKey; viaRoles: string[] }[]>();
  for (const p of query.data?.permissions ?? []) {
    const { resourceType } = permissionParts(p.key);
    groups.set(resourceType, [...(groups.get(resourceType) ?? []), p]);
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] max-w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Permissions of {member.displayName}</SheetTitle>
          <SheetDescription>
            Everything this member can do in {active.name}, from all of their roles.
          </SheetDescription>
        </SheetHeader>
        <RoleBadges roles={member.roles} />
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <div className="flex flex-col gap-4" data-testid="effective-permissions">
            {[...groups.entries()].map(([resource, items]) => (
              <section key={resource}>
                <h3 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">
                  {RESOURCE_LABELS[resource] ?? resource}
                </h3>
                <ul className="flex flex-col gap-1">
                  {items.map((p) => (
                    <li key={p.key} className="flex flex-col text-[13px]">
                      <span>{PERMISSION_CATALOG[p.key].description}</span>
                      <span className="text-xs text-muted-foreground">
                        <code>{p.key}</code> · via{' '}
                        {p.viaRoles
                          .map((r) => OrgRoleLabels[r as keyof typeof OrgRoleLabels] ?? r)
                          .join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {query.data.grants.length ? (
              <section>
                <h3 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">
                  Shared with this member
                </h3>
                <ul className="flex flex-col gap-1 text-[13px]">
                  {query.data.grants.map((g) => (
                    <li key={g.id}>
                      {g.resourceType} {g.resourceId.slice(0, 8)} — {g.actions.join(', ')}
                      {g.expiresAt ? ` (until ${new Date(g.expiresAt).toLocaleDateString()})` : ''}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
