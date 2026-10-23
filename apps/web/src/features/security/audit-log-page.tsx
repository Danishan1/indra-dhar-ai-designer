'use client';

import type { AuditEventView } from '@ai-designer/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { FormField } from '@/components/forms/form-field';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';
import { cn } from '@/lib/utils';

import { type AuditFilters, securityApi } from './api';

const OUTCOMES = [
  { value: 'all', label: 'Any outcome' },
  { value: 'success', label: 'Success' },
  { value: 'denied', label: 'Denied' },
  { value: 'failed', label: 'Failed' },
];

const outcomeTone: Record<string, string> = {
  success: 'text-status-ok',
  denied: 'text-destructive',
  failed: 'text-destructive',
  indeterminate: 'text-muted-foreground',
};

const toIso = (local: string) => (local ? new Date(local).toISOString() : undefined);

/** Settings → Audit log (needs `audit.view`). Read-only; searching is itself audited. */
export function AuditLogPage() {
  const { active, can } = useOrganization();
  const [form, setForm] = useState({
    eventType: '',
    actorId: '',
    outcome: 'all',
    from: '',
    to: '',
  });
  const [filters, setFilters] = useState<AuditFilters>({});
  const [selected, setSelected] = useState<AuditEventView | null>(null);
  const events = useInfiniteQuery({
    queryKey: queryKeys.org(active.id).auditEvents(filters as Record<string, unknown>),
    queryFn: ({ pageParam, signal }) =>
      securityApi.auditEvents(active.id, filters, pageParam ?? undefined, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: can('audit.view'),
  });

  const header = (
    <PageHeader
      title="Audit log"
      description={`Security-relevant activity in ${active.name}. Records can’t be changed.`}
    />
  );
  if (!can('audit.view')) {
    return (
      <>
        {header}
        <div className="p-6">
          <EmptyState title="You can't view the audit log" description="Owners and admins can." />
        </div>
      </>
    );
  }
  const items = events.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      {header}
      <div className="flex flex-col gap-4 p-6">
        <form
          noValidate
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({
              ...(form.eventType ? { eventType: form.eventType } : {}),
              ...(form.actorId ? { actorId: form.actorId } : {}),
              ...(form.outcome !== 'all' ? { outcome: form.outcome } : {}),
              ...(form.from ? { from: toIso(form.from) } : {}),
              ...(form.to ? { to: toIso(form.to) } : {}),
            });
          }}
        >
          <FormField label="Event type starts with">
            <Input
              placeholder="e.g. organizations.membership"
              value={form.eventType}
              onChange={(e) => setForm({ ...form, eventType: e.target.value })}
            />
          </FormField>
          <FormField label="Actor id">
            <Input
              value={form.actorId}
              onChange={(e) => setForm({ ...form, actorId: e.target.value })}
            />
          </FormField>
          <FormField label="Outcome">
            <SimpleSelect
              value={form.outcome}
              onValueChange={(v) => setForm({ ...form, outcome: v })}
              options={OUTCOMES}
            />
          </FormField>
          <FormField label="From">
            <Input
              type="datetime-local"
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
            />
          </FormField>
          <FormField label="To">
            <Input
              type="datetime-local"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
            />
          </FormField>
          <div className="flex gap-2 lg:col-span-5">
            <Button type="submit" size="sm">
              Search
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setForm({ eventType: '', actorId: '', outcome: 'all', from: '', to: '' });
                setFilters({});
              }}
            >
              Clear
            </Button>
          </div>
        </form>
        {events.isPending ? (
          <LoadingState />
        ) : events.isError ? (
          <ErrorState error={events.error} onRetry={() => void events.refetch()} />
        ) : !items.length ? (
          <EmptyState title="No matching events" />
        ) : (
          <>
            <Table aria-label="Audit events">
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((e) => (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => setSelected(e)}
                    onKeyDown={(k) => k.key === 'Enter' && setSelected(e)}
                    data-testid="audit-row"
                  >
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(e.occurredAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-[12px]">{e.eventType}</TableCell>
                    <TableCell>{e.actor.displayName ?? e.actor.type}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.resourceType ? `${e.resourceType}` : '—'}
                    </TableCell>
                    <TableCell className={cn('font-medium', outcomeTone[e.outcome])}>
                      {e.outcome}
                      {e.reasonCode ? (
                        <span className="ml-1 text-xs text-muted-foreground">({e.reasonCode})</span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {events.hasNextPage ? (
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                disabled={events.isFetchingNextPage}
                onClick={() => void events.fetchNextPage()}
              >
                Load more
              </Button>
            ) : null}
          </>
        )}
      </div>
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-[480px] max-w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-mono text-sm">{selected?.eventType}</SheetTitle>
            <SheetDescription>
              {selected ? new Date(selected.occurredAt).toLocaleString() : ''}
            </SheetDescription>
          </SheetHeader>
          {selected ? (
            <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-[13px]">
              <dt className="text-muted-foreground">Action</dt>
              <dd className="font-mono">{selected.action}</dd>
              <dt className="text-muted-foreground">Outcome</dt>
              <dd>
                {selected.outcome}
                {selected.reasonCode ? ` (${selected.reasonCode})` : ''}
              </dd>
              <dt className="text-muted-foreground">Actor</dt>
              <dd>
                {selected.actor.displayName ?? selected.actor.type}{' '}
                <span className="font-mono text-xs text-muted-foreground">{selected.actor.id}</span>
              </dd>
              <dt className="text-muted-foreground">Resource</dt>
              <dd className="font-mono text-xs">
                {selected.resourceType ?? '—'} {selected.resourceId ?? ''}
              </dd>
              <dt className="text-muted-foreground">Request id</dt>
              <dd className="font-mono text-xs">{selected.requestId ?? '—'}</dd>
              <dt className="col-span-2 mt-2 text-muted-foreground">Details (redacted)</dt>
              <dd className="col-span-2">
                <pre className="overflow-x-auto rounded-md bg-muted p-2 text-[11px]">
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
              </dd>
            </dl>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
