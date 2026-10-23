'use client';

import { OrgRoleLabels } from '@ai-designer/contracts';
import { Building2Icon, CheckIcon, ChevronsUpDownIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { CreateOrganizationForm } from './create-organization-form';
import { useOrganization } from './organization-provider';

export function OrgSwitcher() {
  const { organizations, active, setActive } = useOrganization();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="max-w-64 gap-2"
            aria-label={`Organization: ${active.name}. Switch organization`}
          >
            <Building2Icon aria-hidden />
            <span className="truncate text-[13px]">{active.name}</span>
            <ChevronsUpDownIcon className="size-3.5 opacity-60" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          {organizations.map((org) => {
            const suspended = org.membership.status !== 'active';
            return (
              <DropdownMenuItem
                key={org.id}
                disabled={suspended}
                onSelect={() => setActive(org.id)}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{org.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {suspended
                      ? 'Membership suspended'
                      : org.membership.roles.map((r) => OrgRoleLabels[r]).join(', ')}
                  </span>
                </span>
                {org.id === active.id ? (
                  <CheckIcon className="text-primary" aria-label="Current organization" />
                ) : null}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <PlusIcon aria-hidden /> Create organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
            <DialogDescription>
              You will be its owner. Switch between organizations from this menu.
            </DialogDescription>
          </DialogHeader>
          <CreateOrganizationForm
            onCreated={(orgId) => {
              setActive(orgId);
              setCreating(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
