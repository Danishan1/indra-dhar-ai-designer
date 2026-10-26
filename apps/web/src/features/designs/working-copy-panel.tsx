'use client';

import type { Design, WorkingCopy } from '@ai-designer/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOrganization } from '@/features/organizations/organization-provider';
import { ApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query/keys';

import { designsApi, newIdempotencyKey } from './api';

interface FindingLike {
  ruleId: string;
  outcome: string;
  message: string;
}

/**
 * Developer-quality working-copy editor (I12): the state as JSON, save with the version you saw,
 * commit as a revision. The visual editor replaces this in I15–I19.
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
  const [text, setText] = useState(() => JSON.stringify(workingCopy.state, null, 2));
  const [summary, setSummary] = useState('');
  const [problems, setProblems] = useState<FindingLike[] | null>(null);
  const [conflict, setConflict] = useState(false);
  const commitKey = useRef(newIdempotencyKey());

  // A newer working copy (restore, commit, reload) replaces the text.
  useEffect(() => {
    setText(JSON.stringify(workingCopy.state, null, 2));
    setConflict(false);
  }, [workingCopy.version, workingCopy.state]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.design(design.id) }),
      queryClient.invalidateQueries({ queryKey: keys.projectDesigns(design.projectId) }),
    ]);
  };
  const explain = (e: unknown) => {
    if (e instanceof ApiError && e.code === 'CONCURRENT_MODIFICATION') {
      setConflict(true);
      return;
    }
    if (e instanceof ApiError && e.code === 'VALIDATION_BLOCKED') {
      setProblems(((e.details?.findings as FindingLike[] | undefined) ?? []).slice(0, 20));
      toast.error('The design has problems that must be fixed first');
      return;
    }
    toast.error(e instanceof ApiError ? e.message : 'Something went wrong');
  };

  const save = useMutation({
    meta: { silent: true },
    mutationFn: async () => {
      let state: Record<string, unknown>;
      try {
        state = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new ApiError('VALIDATION_FAILED', 'The text is not valid JSON', 400, '');
      }
      return designsApi.save(active.id, design.id, {
        expectedVersion: workingCopy.version,
        state,
      });
    },
    onSuccess: async (wc) => {
      setProblems(wc.findings);
      queryClient.setQueryData(keys.workingCopy(design.id), wc);
      toast.success('Draft saved');
      await refresh();
    },
    onError: explain,
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
        queryClient.invalidateQueries({ queryKey: keys.workingCopy(design.id) }),
        queryClient.invalidateQueries({ queryKey: keys.revisions(design.id) }),
      ]);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'NO_CHANGES') {
        toast.info('Nothing about the garment changed since the last revision');
        return;
      }
      explain(e);
    },
  });

  const dirty = text !== JSON.stringify(workingCopy.state, null, 2);
  const shown = problems ?? workingCopy.findings;

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
      {conflict ? (
        <div
          role="alert"
          className="flex items-center justify-between rounded-md border border-status-needs-review/40 p-2 text-[13px]"
        >
          Someone else changed this design. Reload to see their version (your text is kept until you
          do).
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void queryClient.invalidateQueries({ queryKey: keys.workingCopy(design.id) })
            }
          >
            Reload
          </Button>
        </div>
      ) : null}
      <FormField
        label="Design state (JSON)"
        hint="Developer view — the visual editor arrives later."
      >
        <textarea
          aria-label="Design state (JSON)"
          className="min-h-80 w-full rounded-md border border-input bg-transparent p-2 font-mono text-[12px]"
          spellCheck={false}
          readOnly={readOnly || !can('design.edit')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </FormField>
      {shown.length ? (
        <ul aria-label="Findings" className="flex flex-col gap-1 text-[12px]">
          {shown.map((f, i) => (
            <li key={`${f.ruleId}-${String(i)}`}>
              <span className="font-medium">{f.outcome.replaceAll('_', ' ')}</span> · {f.message}
            </li>
          ))}
        </ul>
      ) : null}
      {!readOnly ? (
        <div className="flex flex-wrap items-end gap-2">
          {can('design.edit') ? (
            <Button
              size="sm"
              variant="outline"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
            >
              Save draft
            </Button>
          ) : null}
          {can('design.commit') ? (
            <>
              <FormField label="Revision note" className="min-w-64 flex-1">
                <Input
                  value={summary}
                  maxLength={500}
                  placeholder="What changed and why (optional)"
                  onChange={(e) => setSummary(e.target.value)}
                />
              </FormField>
              <Button
                size="sm"
                disabled={dirty || commit.isPending}
                onClick={() => commit.mutate()}
              >
                Save as revision
              </Button>
            </>
          ) : null}
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          This project is not active, so its designs are read-only.
        </p>
      )}
    </section>
  );
}
