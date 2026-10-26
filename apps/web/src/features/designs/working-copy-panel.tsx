'use client';

import type { Design, WorkingCopy } from '@ai-designer/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { useOrganization } from '@/features/organizations/organization-provider';
import { ApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query/keys';

import { designsApi, newIdempotencyKey } from './api';

interface PV {
  value: unknown;
  unit: string | null;
  status: string;
}
interface Component {
  componentId: string;
  componentType: string;
  displayName: string;
  properties: Record<string, PV>;
}

const label = (key: string) => (key.split('.')[1] ?? key).replaceAll('_', ' ');

/**
 * Developer draft panel (I12/I14): every change is a design operation; the visual editor (I15–I19)
 * replaces this with real tools. Shows the state read-only, quick operations and undo.
 */
export function WorkingCopyPanel({
  design,
  workingCopy,
  readOnly,
}: {
  design: Design;
  workingCopy: WorkingCopy;
  readOnly: boolean;
}) {
  const { active, can } = useOrganization();
  const queryClient = useQueryClient();
  const keys = queryKeys.org(active.id);
  const components = ((workingCopy.state as { components?: Component[] }).components ??
    []) as Component[];
  const [componentId, setComponentId] = useState(components[0]?.componentId ?? '');
  const component = components.find((c) => c.componentId === componentId);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [summary, setSummary] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const commitKey = useRef(newIdempotencyKey());
  const operations = useQuery({
    queryKey: keys.operations(design.id),
    queryFn: ({ signal }) => designsApi.operations(active.id, design.id, signal),
  });

  useEffect(() => {
    setName(component?.displayName ?? '');
    setKey(Object.keys(component?.properties ?? {})[0] ?? '');
  }, [component?.componentId, component?.displayName, component?.properties]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.workingCopy(design.id) }),
      queryClient.invalidateQueries({ queryKey: keys.design(design.id) }),
      queryClient.invalidateQueries({ queryKey: keys.operations(design.id) }),
      queryClient.invalidateQueries({ queryKey: keys.projectDesigns(design.projectId) }),
    ]);
  };

  const operate = useMutation({
    meta: { silent: true },
    mutationFn: (operation: Record<string, unknown>) =>
      designsApi.operate(active.id, design.id, { expectedVersion: workingCopy.version, operation }),
    onSuccess: async (res) => {
      setProblems(res.findings.map((f) => f.message));
      toast.success(`${res.operation.displayId} applied`);
      await refresh();
    },
    onError: async (e) => {
      if (e instanceof ApiError && e.code === 'VALIDATION_BLOCKED') {
        setProblems(
          ((e.details?.findings as { message: string }[] | undefined) ?? []).map((f) => f.message),
        );
        return;
      }
      if (e instanceof ApiError && e.code === 'CONCURRENT_MODIFICATION') {
        toast.error('Someone else changed this design — reloaded.');
        await refresh();
        return;
      }
      toast.error(e instanceof ApiError ? e.message : 'The change failed');
    },
  });

  const commit = useMutation({
    meta: { silent: true },
    mutationFn: () =>
      designsApi.commit(
        active.id,
        design.id,
        { expectedVersion: workingCopy.version, ...(summary.trim() ? { summary } : {}) },
        commitKey.current,
      ),
    onSuccess: async ({ revision }) => {
      commitKey.current = newIdempotencyKey();
      setSummary('');
      toast.success(`Saved ${revision.displayId}`);
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: keys.revisions(design.id) }),
      ]);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'NO_CHANGES') {
        toast.info('Nothing about the garment changed since the last revision');
        return;
      }
      toast.error(e instanceof ApiError ? e.message : 'Could not save the revision');
    },
  });

  const lastUndoable = operations.data?.items.find((o) => o.revertible);
  const mayEdit = !readOnly && can('design.edit');
  const setPropertyOp = () => {
    const isNumber = value.trim() !== '' && !Number.isNaN(Number(value));
    return {
      type: 'set_property',
      componentId,
      key,
      value: isNumber ? Number(value) : value,
      ...(key.startsWith('dimension.') ? { unit: 'mm' } : {}),
    };
  };

  return (
    <section aria-label="Working copy" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
        <span>Draft version {workingCopy.version}</span>
        {workingCopy.hasUncommittedChanges ? (
          <span data-testid="uncommitted" className="text-status-needs-review">
            · Changes not yet saved as a revision
          </span>
        ) : (
          <span>· Same as the latest revision</span>
        )}
        {workingCopy.restoredFromRevisionId ? (
          <span>· Restored from an earlier revision</span>
        ) : null}
        {workingCopy.migratedFrom ? (
          <span>· Upgraded from schema {workingCopy.migratedFrom}</span>
        ) : null}
      </div>

      {mayEdit ? (
        <div className="flex flex-col gap-3 rounded-md border p-3" aria-label="Quick edit">
          <FormField label="Component">
            <SimpleSelect
              aria-label="Component"
              value={componentId}
              onValueChange={setComponentId}
              options={components.map((c) => ({ value: c.componentId, label: c.displayName }))}
            />
          </FormField>
          <div className="flex items-end gap-2">
            <FormField label="Name" className="flex-1">
              <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <Button
              size="sm"
              variant="outline"
              disabled={operate.isPending || !name.trim() || name === component?.displayName}
              onClick={() =>
                operate.mutate({ type: 'rename_component', componentId, displayName: name })
              }
            >
              Rename
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <FormField label="Property" className="min-w-48">
              <SimpleSelect
                aria-label="Property"
                value={key}
                onValueChange={setKey}
                options={Object.keys(component?.properties ?? {}).map((k) => ({
                  value: k,
                  label: label(k),
                }))}
              />
            </FormField>
            <FormField
              label={key.startsWith('dimension.') ? 'Value (mm)' : 'Value'}
              className="flex-1"
            >
              <Input value={value} onChange={(e) => setValue(e.target.value)} />
            </FormField>
            <Button
              size="sm"
              variant="outline"
              disabled={operate.isPending || !key || !value.trim()}
              onClick={() => operate.mutate(setPropertyOp())}
            >
              Set
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={operate.isPending || !lastUndoable}
              onClick={() =>
                lastUndoable &&
                operate.mutate({ type: 'revert_operation', operationId: lastUndoable.id })
              }
            >
              Undo last change
            </Button>
            {lastUndoable ? (
              <span className="text-[12px] text-muted-foreground">
                {lastUndoable.displayId} · {lastUndoable.operationType.replaceAll('_', ' ')}
              </span>
            ) : null}
          </div>
          {problems.length ? (
            <ul role="alert" aria-label="Findings" className="list-disc pl-5 text-[12px]">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <details>
        <summary className="cursor-pointer text-[12px] text-muted-foreground">
          Design state (JSON, read-only)
        </summary>
        <pre
          aria-label="Design state (JSON)"
          className="max-h-96 overflow-auto rounded-md border p-2 text-[11px]"
        >
          {JSON.stringify(workingCopy.state, null, 2)}
        </pre>
      </details>
      {workingCopy.findings.length ? (
        <ul aria-label="Checks" className="flex flex-col gap-1 text-[12px]">
          {workingCopy.findings.map((f, i) => (
            <li key={`${f.ruleId}-${String(i)}`}>
              <span className="font-medium">{f.outcome.replaceAll('_', ' ')}</span> · {f.message}
            </li>
          ))}
        </ul>
      ) : null}

      {!readOnly && can('design.commit') ? (
        <div className="flex flex-wrap items-end gap-2">
          <FormField label="Revision note" className="min-w-64 flex-1">
            <Input
              value={summary}
              maxLength={500}
              placeholder="What changed and why (optional)"
              onChange={(e) => setSummary(e.target.value)}
            />
          </FormField>
          <Button size="sm" disabled={commit.isPending} onClick={() => commit.mutate()}>
            Save as revision
          </Button>
        </div>
      ) : readOnly ? (
        <p className="text-[13px] text-muted-foreground">
          This project is not active, so its designs are read-only.
        </p>
      ) : null}
    </section>
  );
}
