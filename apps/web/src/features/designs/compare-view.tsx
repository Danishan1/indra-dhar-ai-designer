'use client';

import { useQuery } from '@tanstack/react-query';

import { ErrorState, LoadingState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';

import { designsApi } from './api';

/** Structural comparison (developer view; visual comparison arrives in I19/I35). */
export function CompareView({
  designId,
  from,
  to,
  onClose,
}: {
  designId: string;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const { active } = useOrganization();
  const cmp = useQuery({
    queryKey: queryKeys.org(active.id).compare(designId, from, to),
    queryFn: ({ signal }) => designsApi.compare(active.id, designId, from, to, signal),
  });
  return (
    <section aria-label="Comparison" className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-medium">
          {cmp.data ? `${cmp.data.from.label} → ${cmp.data.to.label}` : 'Comparing…'}
        </h2>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      {cmp.isPending ? (
        <LoadingState />
      ) : cmp.isError ? (
        <ErrorState error={cmp.error} onRetry={() => void cmp.refetch()} />
      ) : (
        <>
          {cmp.data.summary.length ? (
            <ul data-testid="compare-summary" className="list-disc pl-5 text-[13px]">
              {cmp.data.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p data-testid="compare-summary" className="text-[13px] text-muted-foreground">
              No differences.
            </p>
          )}
          <details>
            <summary className="cursor-pointer text-[12px] text-muted-foreground">
              Structural diff (JSON)
            </summary>
            <pre className="max-h-96 overflow-auto text-[11px]">
              {JSON.stringify(cmp.data.diff, null, 2)}
            </pre>
          </details>
        </>
      )}
    </section>
  );
}
