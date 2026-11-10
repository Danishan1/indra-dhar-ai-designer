'use client';

import type { SizeChart, SizeChartInput } from '@ai-designer/contracts';
import type { BodyMeasurementKey, PatternAudience, SizeSystem } from '@ai-designer/garment-model';
import {
  BODY_LABELS,
  measurementsFor,
  SIZE_SYSTEM_LABELS,
  sizesFor,
} from '@ai-designer/pattern-model';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, RulerIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shell/page-header';
import { ErrorState, LoadingState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/select';
import { useOrganization } from '@/features/organizations/organization-provider';
import { toApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query/keys';
import { cn } from '@/lib/utils';

import { sizeChartsApi } from './api';

const AUDIENCES: { value: PatternAudience; label: string }[] = [
  { value: 'women', label: 'Women' },
  { value: 'men', label: 'Men' },
  { value: 'girls', label: 'Girls' },
  { value: 'boys', label: 'Boys' },
];
const KEY_MEASUREMENTS: BodyMeasurementKey[] = ['height', 'bust', 'waist', 'hip'];
const STANDARDS: Exclude<SizeSystem, 'custom'>[] = ['intl', 'uk', 'us', 'eu'];

interface Draft {
  id: string | null;
  name: string;
  audience: PatternAudience;
  columns: BodyMeasurementKey[];
  sizes: { label: string; body: Partial<Record<BodyMeasurementKey, number>> }[];
}

const columnsOf = (sizes: Draft['sizes']): BodyMeasurementKey[] => {
  const used = new Set(sizes.flatMap((s) => Object.keys(s.body) as BodyMeasurementKey[]));
  return [...KEY_MEASUREMENTS, ...[...used].filter((k) => !KEY_MEASUREMENTS.includes(k))];
};

const fromStandard = (
  audience: PatternAudience,
  system: Exclude<SizeSystem, 'custom'>,
  columns: BodyMeasurementKey[],
): Draft['sizes'] =>
  sizesFor(audience, system).map((label) => {
    const m = measurementsFor(audience, label, system);
    return {
      label,
      body: Object.fromEntries(columns.map((k) => [k, m[k]])) as Draft['sizes'][number]['body'],
    };
  });

const blank = (): Draft => ({
  id: null,
  name: '',
  audience: 'women',
  columns: KEY_MEASUREMENTS,
  sizes: fromStandard('women', 'intl', KEY_MEASUREMENTS),
});

/**
 * Settings → Size charts (ADR-067): the organization's own size charts — named sizes with the body
 * measurements that define them. Designs and tech packs pick them like UK, US or EU sizes; a design
 * keeps a copy, so changing a chart later never changes existing designs.
 */
export function SizeChartsPage() {
  const { active, can } = useOrganization();
  const queryClient = useQueryClient();
  const key = queryKeys.org(active.id).sizeCharts();
  const charts = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => sizeChartsApi.list(active.id, signal),
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const canEdit = can('artifact.create');

  const open = (c: SizeChart) =>
    setDraft({
      id: c.id,
      name: c.name,
      audience: c.audience,
      columns: columnsOf(c.sizes as Draft['sizes']),
      sizes: c.sizes as Draft['sizes'],
    });

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body: SizeChartInput = {
        name: d.name.trim(),
        audience: d.audience,
        sizes: d.sizes.map((s) => ({
          label: s.label.trim(),
          body: Object.fromEntries(
            Object.entries(s.body).filter(
              ([k, v]) => d.columns.includes(k as BodyMeasurementKey) && v && v > 0,
            ),
          ),
        })),
      };
      return d.id
        ? sizeChartsApi.update(active.id, d.id, body)
        : sizeChartsApi.create(active.id, body);
    },
    onSuccess: async (c) => {
      toast.success(`Saved ${c.name}`);
      await queryClient.invalidateQueries({ queryKey: key });
      open(c);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => sizeChartsApi.remove(active.id, id),
    onSuccess: async () => {
      toast.success('Size chart deleted');
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });

  if (charts.isPending) return <LoadingState />;
  if (charts.isError)
    return <ErrorState error={charts.error} onRetry={() => void charts.refetch()} />;
  const items = charts.data.items;

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Size charts"
        description="Your own size charts, next to the International, UK, US and EU standards. Designs and tech packs can use them; a design keeps a copy, so editing a chart never changes existing designs."
        actions={
          canEdit ? (
            <Button size="sm" onClick={() => setDraft(blank())} data-testid="new-size-chart">
              <PlusIcon /> New size chart
            </Button>
          ) : null
        }
      />
      <div className="mx-auto grid w-full max-w-6xl gap-6 p-6 lg:grid-cols-[260px_1fr]">
        <nav aria-label="Size charts" className="flex flex-col gap-1" data-testid="size-chart-list">
          {items.length ? (
            items.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => open(c)}
                className={cn(
                  'flex flex-col rounded-md border px-3 py-2 text-left text-[13px]',
                  draft?.id === c.id ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                )}
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-[12px] text-muted-foreground">
                  {AUDIENCES.find((a) => a.value === c.audience)?.label} ·{' '}
                  {c.sizes.map((s) => s.label).join(', ')}
                </span>
              </button>
            ))
          ) : (
            <p className="text-[13px] text-muted-foreground">
              No size charts yet. Designs use the standard charts until you add your own.
            </p>
          )}
        </nav>
        {draft ? (
          <ChartEditor
            draft={draft}
            onChange={setDraft}
            canEdit={canEdit}
            saving={save.isPending}
            error={save.error ? toApiError(save.error).message : null}
            onSave={() => save.mutate(draft)}
            onDelete={draft.id ? () => remove.mutate(draft.id!) : null}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-[13px] text-muted-foreground">
            <RulerIcon className="size-6" aria-hidden />
            Choose a size chart, or create one — start from a standard and adjust the measurements.
          </div>
        )}
      </div>
    </div>
  );
}

function ChartEditor({
  draft,
  onChange,
  canEdit,
  saving,
  error,
  onSave,
  onDelete,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  canEdit: boolean;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onDelete: (() => void) | null;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const setCell = (row: number, k: BodyMeasurementKey, cm: string) => {
    const v = parseFloat(cm.replace(',', '.'));
    set({
      sizes: draft.sizes.map((s, i) =>
        i === row
          ? { ...s, body: { ...s.body, [k]: Number.isFinite(v) ? Math.round(v * 10) : undefined } }
          : s,
      ),
    });
  };
  const extra = (Object.keys(BODY_LABELS) as BodyMeasurementKey[]).filter(
    (k) => !draft.columns.includes(k),
  );
  return (
    <section
      className="flex flex-col gap-4"
      aria-label="Size chart"
      data-testid="size-chart-editor"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_160px_200px]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="chart-name">Name</Label>
          <Input
            id="chart-name"
            value={draft.name}
            maxLength={120}
            disabled={!canEdit}
            placeholder="e.g. Brand boys 2027"
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="chart-for">For</Label>
          <SimpleSelect
            id="chart-for"
            value={draft.audience}
            disabled={!canEdit}
            onValueChange={(v) => set({ audience: v as PatternAudience })}
            options={AUDIENCES}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="chart-start">Start from</Label>
          <SimpleSelect
            id="chart-start"
            value=""
            disabled={!canEdit}
            placeholder="A standard…"
            onValueChange={(v) =>
              set({
                sizes: fromStandard(
                  draft.audience,
                  v as Exclude<SizeSystem, 'custom'>,
                  draft.columns,
                ),
              })
            }
            options={STANDARDS.map((s) => ({
              value: s,
              label: `${SIZE_SYSTEM_LABELS[s]} ${draft.audience} sizes`,
            }))}
          />
        </div>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Body measurements in cm. The pattern engine adds ease for the fit. Measurements left empty
        follow the standard body chart, matched on{' '}
        {draft.audience === 'girls' || draft.audience === 'boys' ? 'height' : 'bust / chest'}.
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-[13px]" data-testid="size-chart-table">
          <thead className="bg-muted/50 text-[12px] text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">Size</th>
              {draft.columns.map((k) => (
                <th key={k} className="px-2 py-1.5 text-left font-medium">
                  <span className="flex items-center gap-1">
                    {BODY_LABELS[k]}
                    {canEdit && !KEY_MEASUREMENTS.includes(k) ? (
                      <button
                        type="button"
                        aria-label={`Remove ${BODY_LABELS[k]}`}
                        onClick={() => set({ columns: draft.columns.filter((c) => c !== k) })}
                      >
                        <XIcon className="size-3" />
                      </button>
                    ) : null}
                  </span>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.sizes.map((s, row) => (
              <tr key={row} className="border-t">
                <td className="px-2 py-1">
                  <Input
                    aria-label={`Size ${row + 1} label`}
                    value={s.label}
                    maxLength={20}
                    disabled={!canEdit}
                    className="h-7 w-20"
                    onChange={(e) =>
                      set({
                        sizes: draft.sizes.map((x, i) =>
                          i === row ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </td>
                {draft.columns.map((k) => (
                  <td key={k} className="px-2 py-1">
                    <Input
                      aria-label={`${s.label} ${BODY_LABELS[k]} (cm)`}
                      inputMode="decimal"
                      disabled={!canEdit}
                      className="h-7 w-20 tabular-nums"
                      defaultValue={s.body[k] ? (s.body[k]! / 10).toFixed(1) : ''}
                      key={`${row}-${k}-${s.body[k] ?? ''}-${draft.id ?? 'new'}`}
                      onBlur={(e) => setCell(row, k, e.target.value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-1">
                  {canEdit && draft.sizes.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Remove size ${s.label}`}
                      onClick={() => set({ sizes: draft.sizes.filter((_, i) => i !== row) })}
                    >
                      <Trash2Icon />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => set({ sizes: [...draft.sizes, { label: '', body: {} }] })}
            data-testid="add-size"
          >
            <PlusIcon /> Add size
          </Button>
          {extra.length ? (
            <div className="w-56">
              <SimpleSelect
                value=""
                placeholder="Add a measurement…"
                onValueChange={(v) => set({ columns: [...draft.columns, v as BodyMeasurementKey] })}
                options={extra.map((k) => ({ value: k, label: BODY_LABELS[k] }))}
              />
            </div>
          ) : null}
          <span className="flex-1" />
          {onDelete ? (
            <Button variant="ghost" size="sm" onClick={onDelete} data-testid="delete-size-chart">
              <Trash2Icon /> Delete
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={onSave}
            disabled={saving || !draft.name.trim() || draft.sizes.some((s) => !s.label.trim())}
            data-testid="save-size-chart"
          >
            {saving ? 'Saving…' : 'Save chart'}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
