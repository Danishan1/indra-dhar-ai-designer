'use client';

import {
  allowedPropertyKeys,
  type DesignComponent,
  defaultCatalog,
  evaluatePropertyRules,
  type PropertyDefinition,
} from '@ai-designer/garment-model';
import { EyeOffIcon, InfoIcon, LockIcon, UsersIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/ui/select';
import { PreferenceKeys, readPreference, writePreference } from '@/lib/local-preferences';

import { useScene } from '../canvas/scene-context';
import { useEditor } from '../store-context';

import { PropertyRow } from './property-row';
import { DISPLAY_LENGTH_UNITS, type DisplayLengthUnit, enumLabel, summarize } from './value-input';

const GROUP_ORDER = ['Appearance', 'Construction', 'Dimensions', 'Material', 'Placement'];

function useLengthUnit(): [DisplayLengthUnit, (u: DisplayLengthUnit) => void] {
  const [unit, setUnit] = useState<DisplayLengthUnit>('cm');
  useEffect(() => {
    const stored = readPreference(PreferenceKeys.lengthUnit);
    if (stored && (DISPLAY_LENGTH_UNITS as readonly string[]).includes(stored))
      setUnit(stored as DisplayLengthUnit);
  }, []);
  return [
    unit,
    (u) => {
      setUnit(u);
      writePreference(PreferenceKeys.lengthUnit, u);
    },
  ];
}

const typeLabel = (type: string) =>
  defaultCatalog.componentTypes.get(type)?.label ?? enumLabel(type);

/** Contextual properties (FR-EDT-028…038): of the selection, or of the design when nothing is selected. */
export function PropertiesPanel() {
  const components = useEditor((s) => s.display.components);
  const ids = useEditor((s) => s.selection.ids);
  const [unit, setUnit] = useLengthUnit();
  const selected = useMemo(
    () =>
      ids
        .map((id) => components.find((c) => c.componentId === id))
        .filter((c): c is DesignComponent => !!c),
    [ids, components],
  );
  return (
    <div className="flex flex-col pb-4" aria-label="Properties of the selection">
      <div className="flex items-center justify-end gap-1 border-b px-3 py-1">
        <span className="text-[11px] text-muted-foreground">Lengths in</span>
        <SimpleSelect
          aria-label="Length unit"
          value={unit}
          className="h-6 w-16 text-[11px]"
          onValueChange={(v) => setUnit(v as DisplayLengthUnit)}
          options={DISPLAY_LENGTH_UNITS.map((u) => ({ value: u, label: u }))}
        />
      </div>
      {selected.length === 0 ? (
        <DesignSummary />
      ) : selected.length === 1 ? (
        <ComponentProperties key={selected[0]!.componentId} targets={selected} unit={unit} />
      ) : (
        <ComponentProperties key={ids.join(',')} targets={selected} unit={unit} />
      )}
    </div>
  );
}

function DesignSummary() {
  const meta = useEditor((s) => s.meta);
  const state = useEditor((s) => s.display);
  const counts = useMemo(() => {
    let missing = 0;
    let review = 0;
    let confirmed = 0;
    for (const c of state.components)
      for (const pv of Object.values(c.properties)) {
        if (pv.status === 'missing') missing++;
        if (pv.status === 'needs_review' || pv.status === 'inferred' || pv.status === 'proposed')
          review++;
        if (pv.status === 'confirmed') confirmed++;
      }
    return { missing, review, confirmed };
  }, [state.components]);
  const category = state.garmentCategory
    ? (defaultCatalog.categories.get(state.garmentCategory)?.label ??
      enumLabel(state.garmentCategory))
    : 'Not set';
  const metadata = Object.entries(state.metadata ?? {});
  return (
    <div className="flex flex-col gap-3 p-3 text-[13px]" data-testid="design-properties">
      <p className="text-muted-foreground">
        Select a component in the drawing or the hierarchy to edit its properties.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        <dt className="text-muted-foreground">Design</dt>
        <dd>
          {meta.design.name}{' '}
          <span className="text-muted-foreground">· {meta.design.displayId}</span>
        </dd>
        <dt className="text-muted-foreground">Project</dt>
        <dd>{meta.project.name}</dd>
        <dt className="text-muted-foreground">Garment type</dt>
        <dd>{enumLabel(state.garmentType)}</dd>
        <dt className="text-muted-foreground">Category</dt>
        <dd>{category}</dd>
        <dt className="text-muted-foreground">Components</dt>
        <dd>{state.components.length}</dd>
        <dt className="text-muted-foreground">Values</dt>
        <dd>
          {counts.confirmed} confirmed · {counts.review} to review · {counts.missing} missing
        </dd>
        {metadata.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{enumLabel(k)}</dt>
            <dd className="truncate">
              {typeof v === 'string' || typeof v === 'number' ? String(v) : JSON.stringify(v)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ComponentProperties({
  targets,
  unit,
}: {
  targets: DesignComponent[];
  unit: DisplayLengthUnit;
}) {
  const state = useEditor((s) => s.display);
  const canEdit = useEditor((s) => s.meta.capabilities.canEdit);
  const apply = useEditor((s) => s.apply);
  const scene = useScene();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bulkConfirmed, setBulkConfirmed] = useState(false);
  const first = targets[0]!;
  const multi = targets.length > 1;
  const sameType = targets.every((t) => t.componentType === first.componentType);

  // Only properties every selected component may carry (never applied to another type — FR-EDT-027).
  const keys = useMemo(() => {
    const sets = targets.map((t) => new Set(allowedPropertyKeys(defaultCatalog, t.componentType)));
    return [...(sets[0] ?? [])].filter((k) => sets.every((s) => s.has(k)));
  }, [targets]);
  const rules = useMemo(
    () => targets.map((t) => evaluatePropertyRules(state, t)),
    [targets, state],
  );
  const defs = keys
    .map((k) => defaultCatalog.properties.get(k))
    .filter((d): d is PropertyDefinition => !!d);
  const groups = useMemo(() => {
    const map = new Map<string, PropertyDefinition[]>();
    for (const d of defs) map.set(d.ui.group, [...(map.get(d.ui.group) ?? []), d]);
    return [...map.entries()].sort(
      ([a], [b]) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99),
    );
  }, [defs]);
  const extra = multi ? [] : Object.keys(first.properties).filter((k) => !keys.includes(k));

  const locked = targets.some((t) => t.locked);
  const editable = canEdit && !locked && (!multi || bulkConfirmed);
  const notDrawn = targets.filter((t) => scene.components[t.componentId]?.supported === false);
  const conflicts = rules.flatMap((r, i) =>
    r.conflicts.map((c) => ({ ...c, target: targets[i]! })),
  );
  const hasAdvanced = defs.some((d) => d.ui.advanced);

  return (
    <div className="flex flex-col" data-testid="component-properties">
      <div className="flex flex-col gap-1 border-b px-3 py-2">
        <h2 className="text-[13px] font-semibold" data-testid="properties-title">
          {multi ? `${targets.length} components` : first.displayName}
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {multi
            ? sameType
              ? `${typeLabel(first.componentType)} × ${targets.length}`
              : 'Different component types — only shared properties are shown'
            : `${typeLabel(first.componentType)}${first.side !== 'none' ? ` · ${first.side}` : ''}`}
        </span>
        {multi ? (
          <div
            className="mt-1 flex flex-col gap-1 rounded-md border border-dashed p-2 text-[12px]"
            data-testid="bulk-edit"
          >
            <span className="flex items-center gap-1">
              <UsersIcon className="size-3.5" aria-hidden /> Changes apply to:{' '}
              {targets.map((t) => t.displayName).join(', ')}
            </span>
            {canEdit && !locked ? (
              bulkConfirmed ? (
                <span className="text-muted-foreground">
                  Editing all {targets.length} — each change is one undo step.
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 self-start text-xs"
                  onClick={() => setBulkConfirmed(true)}
                >
                  Edit all {targets.length}
                </Button>
              )
            ) : null}
          </div>
        ) : null}
        {notDrawn.length ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <InfoIcon className="size-3" aria-hidden />
            {notDrawn.map((t) => t.displayName).join(', ')} {notDrawn.length === 1 ? 'is' : 'are'}{' '}
            not drawn in 2D yet — properties can still be edited.
          </span>
        ) : null}
        {targets.some((t) => !t.visible) ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <EyeOffIcon className="size-3" aria-hidden /> Hidden in the editor (still part of the
            design).
          </span>
        ) : null}
        {locked ? (
          <span
            className="flex items-center gap-1 text-[11px] text-muted-foreground"
            data-testid="locked-note"
          >
            <LockIcon className="size-3" aria-hidden /> Locked — unlock it in the hierarchy to edit.
          </span>
        ) : null}
      </div>

      {conflicts.length ? (
        <div
          className="mx-3 mt-2 flex flex-col gap-1 rounded-md border border-status-needs-review/50 p-2 text-[12px]"
          role="region"
          aria-label="Conflicting values"
        >
          <span className="font-medium">Values that no longer apply</span>
          {conflicts.map((c) => {
            const def = defaultCatalog.properties.get(c.key);
            return (
              <div key={`${c.target.componentId}-${c.key}`} className="flex items-center gap-2">
                <span className="flex-1">
                  {multi ? `${c.target.displayName}: ` : ''}
                  {def?.label ?? c.key} (
                  {def ? summarize(def, c.target.properties[c.key], unit) : String(c.value)}) —{' '}
                  {c.reason}
                </span>
                {canEdit && !c.target.locked ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() =>
                      apply(
                        { type: 'reset_property', componentId: c.target.componentId, key: c.key },
                        { label: `Clear ${(def?.label ?? c.key).toLowerCase()}` },
                      )
                    }
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {groups.map(([group, list]) => {
        const visible = list.filter((d) => showAdvanced || !d.ui.advanced);
        if (!visible.length) return null;
        return (
          <details key={group} open className="group/section border-b" data-group={group}>
            <summary className="cursor-pointer px-3 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase select-none">
              {group}
            </summary>
            {visible.map((def) => {
              const values = targets.map((t) => t.properties[def.key]);
              const mixed =
                multi &&
                new Set(values.map((v) => JSON.stringify([v?.value ?? null, v?.unit ?? null])))
                  .size > 1;
              const reason =
                rules.map((r) => r.disabled.get(def.key)).find((r) => r)?.reason ?? null;
              const conflict = rules.some((r) => r.conflicts.some((c) => c.key === def.key));
              return (
                <PropertyRow
                  key={def.key}
                  def={def}
                  pv={values[0]}
                  targets={targets.map((t) => ({
                    componentId: t.componentId,
                    label: t.displayName,
                  }))}
                  unit={unit}
                  editable={editable}
                  disabledReason={reason}
                  conflict={conflict}
                  mixed={mixed}
                />
              );
            })}
          </details>
        );
      })}
      {hasAdvanced ? (
        <Button
          size="sm"
          variant="ghost"
          className="mx-2 mt-1 h-7 self-start text-xs"
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? 'Fewer properties' : 'More properties'}
        </Button>
      ) : null}
      {extra.length ? (
        <div className="px-3 py-2 text-[12px]">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Other
          </span>
          {extra.map((k) => (
            <div key={k} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{k}</span>
              <span className="truncate">{JSON.stringify(first.properties[k]?.value ?? null)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {keys.length === 0 ? (
        <p className="p-3 text-[12px] text-muted-foreground">
          The selected components share no editable properties.
        </p>
      ) : null}
    </div>
  );
}
