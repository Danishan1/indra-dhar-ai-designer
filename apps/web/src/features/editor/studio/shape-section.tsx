'use client';

import type { ComponentShape, DesignComponent } from '@ai-designer/garment-model';
import { ArrowDownIcon, ArrowUpIcon, FlipHorizontal2Icon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { useEditor, useEditorStore } from '../store-context';

import { commitShapeChange } from './shape-sync';

const SOURCE: Record<ComponentShape['source'], string> = {
  observed: 'Traced from your image (AI)',
  inferred: 'AI guess — no clear outline',
  template: 'From the garment template',
  library: 'From the library',
  user: 'Edited by you',
};

/**
 * Shape of the selected artifact (ADR-057): position, size, rotation, layer and colour of each
 * view's vector shape, with where it came from. Size fields drive the linked measurement and the
 * dependent pattern pieces (same as dragging the handles).
 */
export function ShapeSection({ component }: { component: DesignComponent }) {
  const store = useEditorStore();
  const canEdit = useEditor((s) => s.meta.capabilities.canEdit) && !component.locked;
  const shapes = component.shapes ?? [];
  if (!shapes.length) return null;
  const name = component.displayName.toLowerCase();
  const change = (i: number, patch: Partial<ComponentShape>, label: string) =>
    commitShapeChange(
      store,
      component.componentId,
      i,
      { ...shapes[i]!, ...patch, source: 'user', confidence: null },
      label,
    );
  const setAll = (next: ComponentShape[], label: string) =>
    store
      .getState()
      .apply(
        { type: 'set_component_shapes', componentId: component.componentId, shapes: next },
        { label },
      );

  return (
    <details open className="border-b" data-testid="shape-section">
      <summary className="cursor-pointer px-3 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase select-none">
        Shape
      </summary>
      <div className="flex flex-col gap-3 px-3 pb-3">
        {shapes.map((s, i) => (
          <div
            key={`${s.view}-${i}`}
            className="flex flex-col gap-2 rounded-md border p-2 text-[12px]"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium capitalize">{s.view} view</span>
              <span className="text-[11px] text-muted-foreground" data-testid="shape-source">
                {SOURCE[s.source]}
                {s.confidence !== null ? ` · ${Math.round(s.confidence * 100)}%` : ''}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Num
                label="X (mm)"
                value={s.x}
                disabled={!canEdit}
                onCommit={(v) => change(i, { x: v }, `Move ${name}`)}
              />
              <Num
                label="Y (mm)"
                value={s.y}
                disabled={!canEdit}
                onCommit={(v) => change(i, { y: v }, `Move ${name}`)}
              />
              <Num
                label={`Width (mm)${s.links.width ? ' ↔' : ''}`}
                value={s.width}
                min={2}
                disabled={!canEdit}
                onCommit={(v) => change(i, { width: v }, `Resize ${name}`)}
                testId="shape-width"
              />
              <Num
                label={`Height (mm)${s.links.height ? ' ↔' : ''}`}
                value={s.height}
                min={2}
                disabled={!canEdit}
                onCommit={(v) => change(i, { height: v }, `Resize ${name}`)}
                testId="shape-height"
              />
              <Num
                label="Rotation (°)"
                value={s.rotation}
                min={-180}
                max={180}
                disabled={!canEdit}
                onCommit={(v) => change(i, { rotation: v }, `Rotate ${name}`)}
              />
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Fill</span>
                <input
                  type="color"
                  value={s.style.fill ?? '#f1f5f9'}
                  disabled={!canEdit}
                  className="h-7 w-full rounded border"
                  aria-label={`Fill of ${component.displayName}`}
                  onChange={(e) =>
                    change(i, { style: { ...s.style, fill: e.target.value } }, `Colour ${name}`)
                  }
                />
              </label>
            </div>
            {s.links.width || s.links.height ? (
              <p className="text-[11px] text-muted-foreground">
                ↔ drives{' '}
                {[s.links.width, s.links.height]
                  .filter(Boolean)
                  .map((k) => k!.split('.').pop()!.replaceAll('_', ' '))
                  .join(' and ')}{' '}
                — the pattern follows (or is flagged for review).
              </p>
            ) : null}
            {canEdit ? (
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => change(i, { layer: s.layer + 1 }, `Bring ${name} forward`)}
                >
                  <ArrowUpIcon /> Forward
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => change(i, { layer: s.layer - 1 }, `Send ${name} back`)}
                >
                  <ArrowDownIcon /> Back
                </Button>
                {!shapes.some((x) => x.view !== s.view) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() =>
                      setAll(
                        [
                          ...shapes,
                          {
                            ...s,
                            view: s.view === 'front' ? 'back' : 'front',
                            x: -(s.x + s.width),
                            rotation: -s.rotation,
                            path: s.path.map((p) => ({ x: 1 - p.x, y: p.y })),
                            details: [],
                            source: 'user',
                            confidence: null,
                          },
                        ],
                        `Add ${s.view === 'front' ? 'back' : 'front'} view of ${name}`,
                      )
                    }
                  >
                    <FlipHorizontal2Icon /> Mirror to {s.view === 'front' ? 'back' : 'front'}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() =>
                    setAll(
                      shapes.filter((_, k) => k !== i),
                      `Remove ${s.view} shape of ${name}`,
                    )
                  }
                >
                  <Trash2Icon /> Remove
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
}

function Num({
  label,
  value,
  min = -5000,
  max = 5000,
  disabled,
  onCommit,
  testId,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onCommit: (v: number) => void;
  testId?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const v = Math.round(Number(text) * 10) / 10;
    setText(null);
    if (Number.isFinite(v) && v >= min && v <= max && v !== value) onCommit(v);
  };
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground">{label}</span>
      <Input
        type="number"
        step={0.5}
        className="h-7 text-xs"
        value={text ?? String(value)}
        disabled={disabled}
        data-testid={testId}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
    </label>
  );
}
