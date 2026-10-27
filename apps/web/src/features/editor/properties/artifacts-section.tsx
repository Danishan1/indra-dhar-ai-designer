'use client';

import type { DesignComponent, DesignRelationship } from '@ai-designer/garment-model';
import { ArrowUpCircleIcon, Link2OffIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { CATEGORY_LABELS } from '@/features/library/labels';

import { type BindingView, bindingViews, revisionLabel } from '../artifacts/attach';
import { useArtifactInfos } from '../canvas/scene-context';
import { useEditor } from '../store-context';

const human = (s: string) => s.replaceAll('_', ' ');

/**
 * The artifacts a component uses (FR-EDT-056): exact pinned revision, availability, an explicit
 * "Update to Rn" (designs never follow new revisions on their own, ART-005), detach, and placement
 * controls for trims/artwork (region, offset, scale, rotation — in the component's local space).
 */
export function ArtifactsSection({ component }: { component: DesignComponent }) {
  const state = useEditor((s) => s.display);
  const { infos, loaded } = useArtifactInfos();
  const views = bindingViews(state, component, infos, loaded);
  if (!views.length) return null;
  return (
    <details open className="border-b" data-group="Artifacts" data-testid="artifacts-section">
      <summary className="cursor-pointer px-3 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase select-none">
        Artifacts
      </summary>
      <ul className="flex flex-col gap-2 px-3 pb-2">
        {views.map((v) => (
          <BindingItem key={v.binding.bindingId} component={component} view={v} />
        ))}
      </ul>
    </details>
  );
}

function BindingItem({ component, view }: { component: DesignComponent; view: BindingView }) {
  const apply = useEditor((s) => s.apply);
  const canEdit = useEditor((s) => s.meta.capabilities.canEdit);
  const canUse = useEditor((s) => s.meta.capabilities.canUseArtifacts);
  const { binding, info, relationship } = view;
  const editable = canEdit && !component.locked;
  const name = info?.name ?? 'Artifact not available';
  return (
    <li
      className="flex flex-col gap-1 rounded-md border p-2 text-[12px]"
      data-testid="artifact-binding"
      data-binding-id={binding.bindingId}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium" title={name}>
            {name}
          </span>
          <span className="text-[11px] text-muted-foreground" data-testid="binding-revision">
            {info
              ? `${CATEGORY_LABELS[info.category]} · ${info.displayId}`
              : `Pinned revision ${binding.artifactRevisionId.slice(0, 8)}…`}
          </span>
        </div>
        {editable ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Detach ${name}`}
            title="Detach (values it set stay on the component)"
            onClick={() =>
              apply(
                {
                  type: 'detach_artifact',
                  componentId: component.componentId,
                  bindingId: binding.bindingId,
                },
                { label: `Detach ${name} from ${component.displayName}` },
              )
            }
          >
            <Link2OffIcon />
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {view.unavailable ? (
          <Badge variant="outline" title="The design keeps the exact reference; nothing is removed">
            Unavailable — reference kept
          </Badge>
        ) : null}
        {view.deactivated ? (
          <Badge variant="outline" title="Existing uses keep it; it cannot be added again">
            Deactivated
          </Badge>
        ) : null}
        {view.approximate ? (
          <Badge variant="outline" className="gap-1 border-status-needs-review/60">
            <TriangleAlertIcon aria-hidden /> Approximate — needs review
          </Badge>
        ) : null}
      </div>
      {view.update && editable && canUse ? (
        <Button
          size="sm"
          variant="outline"
          className="h-6 self-start px-2 text-xs"
          onClick={() =>
            apply(
              {
                type: 'replace_artifact',
                componentId: component.componentId,
                bindingId: binding.bindingId,
                artifactRevisionId: view.update!.revisionId,
              },
              {
                label: `Update ${name} to ${revisionLabel(view.update!.revisionNumber)}`,
              },
            )
          }
        >
          <ArrowUpCircleIcon aria-hidden /> Update to {revisionLabel(view.update.revisionNumber)}
        </Button>
      ) : view.update ? (
        <span className="text-[11px] text-muted-foreground">
          A newer revision ({revisionLabel(view.update.revisionNumber)}) exists.
        </span>
      ) : null}
      {relationship?.placement ? (
        <PlacementControls
          relationship={relationship}
          regions={[
            ...new Set([
              ...(info?.allowedPlacementRegions ?? info?.preferredPlacementRegions ?? []),
              ...(relationship.placement.region ? [relationship.placement.region] : []),
            ]),
          ]}
          editable={editable}
          label={name}
        />
      ) : null}
    </li>
  );
}

function NumberField({
  label,
  value,
  suffix,
  min,
  max,
  step,
  disabled,
  onCommit,
}: {
  label: string;
  value: number | null;
  suffix: string;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onCommit: (v: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(value === null ? '' : String(value)), [value]);
  const commit = () => {
    const t = text.trim();
    if (t === '') {
      setError(null);
      if (value !== null) onCommit(null);
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n < min || n > max) {
      setError(`Between ${min} and ${max}`);
      return;
    }
    setError(null);
    if (n !== value) onCommit(n);
  };
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1">
        <Input
          inputMode="decimal"
          aria-label={label}
          aria-invalid={error ? true : undefined}
          value={text}
          step={step}
          disabled={disabled}
          placeholder="—"
          className="h-6 px-1.5 text-[12px]"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
        <span className="text-[11px] text-muted-foreground">{suffix}</span>
      </span>
      {error ? <span className="text-[11px] text-destructive">{error}</span> : null}
    </label>
  );
}

function PlacementControls({
  relationship,
  regions,
  editable,
  label,
}: {
  relationship: DesignRelationship;
  regions: string[];
  editable: boolean;
  label: string;
}) {
  const apply = useEditor((s) => s.apply);
  const p = relationship.placement!;
  const offsetMm = p.offset ? (p.offset.unit === 'mm' ? p.offset.value : null) : null;
  const scale = typeof p.scale === 'number' ? p.scale : null;
  const update = (patch: Record<string, unknown>, what: string) =>
    apply(
      { type: 'update_placement', relationshipId: relationship.relationshipId, placement: patch },
      { label: `Change ${what} of ${label}` },
    );
  return (
    <div className="mt-1 flex flex-col gap-1.5" data-testid="placement-controls">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium">Placement</span>
        <span
          className="text-[10px] text-muted-foreground"
          title="Offsets and rotation are measured in the component's own space"
        >
          {human(p.coordinateSpace)}
        </span>
      </div>
      {regions.length ? (
        <SimpleSelect
          aria-label="Placement region"
          value={p.region ?? ''}
          disabled={!editable}
          className="h-6 text-[12px]"
          placeholder="Region"
          onValueChange={(v) => update({ region: v }, 'region')}
          options={regions.map((r) => ({ value: r, label: human(r) }))}
        />
      ) : null}
      <div className="grid grid-cols-3 gap-1.5">
        <NumberField
          label="Offset"
          suffix="mm"
          value={offsetMm}
          min={-1000}
          max={1000}
          step={1}
          disabled={!editable}
          onCommit={(v) => update({ offsetMm: v }, 'offset')}
        />
        <NumberField
          label="Scale"
          suffix="×"
          value={scale}
          min={0.1}
          max={10}
          step={0.1}
          disabled={!editable}
          onCommit={(v) => update({ scale: v }, 'scale')}
        />
        <NumberField
          label="Rotation"
          suffix="°"
          value={p.rotationDeg}
          min={-360}
          max={360}
          step={1}
          disabled={!editable}
          onCommit={(v) => update({ rotationDeg: v }, 'rotation')}
        />
      </div>
    </div>
  );
}
