'use client';

import { type Bounds, fitToBounds, initialViewport, type Viewport } from '@ai-designer/editor-core';
import type { GarmentDesignState } from '@ai-designer/garment-model';
import type { Scene } from '@ai-designer/garment-render';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRightIcon,
  EyeIcon,
  GitCompareIcon,
  LockIcon,
  MaximizeIcon,
  ShieldCheckIcon,
  Undo2Icon,
  XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ErrorState, LoadingState } from '@/components/states/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/ui/select';
import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';
import { cn } from '@/lib/utils';

import type { EditorInspect } from '../store';
import { useEditor, useEditorStore } from '../store-context';

import { DiffList } from './diff-list';
import { FlatSvg, PanZoomArea, sceneBounds, useRenderedScene } from './flat-view';
import { shortLabel } from './history-panel';
import { RestoreDialog } from './restore-dialog';
import { useRevisionHistory, useRevisionsApi, useRevisionSnapshot } from './use-revisions';

/** Shared camera for one or more flats: fitted to the content until the person zooms or pans. */
function useSharedViewport(content: Bounds | null) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [manual, setManual] = useState<Viewport | null>(null);
  const fitted = useMemo(
    () => (content && size && size.width > 0 ? fitToBounds(content, size, 32) : initialViewport),
    [content, size],
  );
  const onSize = useCallback((s: { width: number; height: number }) => setSize(s), []);
  return {
    viewport: manual ?? fitted,
    setViewport: setManual,
    fit: () => setManual(null),
    onSize,
  };
}

const union = (a: Bounds | null, b: Bounds | null): Bounds | null => {
  if (!a || !b) return a ?? b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

/** A side of a comparison: a revision snapshot, or the working copy as displayed. */
function useSide(id: string): {
  state: GarmentDesignState | null;
  label: string;
  loading: boolean;
  error: unknown;
} {
  const display = useEditor((s) => s.display);
  const version = useEditor((s) => s.server.version);
  const snap = useRevisionSnapshot(id === 'working' ? null : id);
  if (id === 'working')
    return { state: display, label: `Working copy · v${version}`, loading: false, error: null };
  return {
    state: snap.state,
    label: snap.data ? shortLabel(snap.data.displayId) : '…',
    loading: snap.isPending,
    error: snap.error,
  };
}

/** Viewing or comparing revisions (I19) — replaces the editing panels while open. */
export function RevisionInspector({ inspect }: { inspect: EditorInspect }) {
  const close = useEditor((s) => s.closeInspect);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return inspect.mode === 'view' ? (
    <RevisionView revisionId={inspect.revisionId} />
  ) : (
    <CompareView a={inspect.a} b={inspect.b} />
  );
}

function BackButton() {
  const close = useEditor((s) => s.closeInspect);
  return (
    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={close}>
      <XIcon aria-hidden /> Back to editing
    </Button>
  );
}

function FlatPane({
  scene,
  viewport,
  label,
  prefix,
  highlight,
  testId,
}: {
  scene: Scene | null;
  viewport: Viewport;
  label: string;
  prefix: string;
  highlight?: ReadonlySet<string>;
  testId: string;
}) {
  return (
    <>
      {scene ? (
        <FlatSvg
          scene={scene}
          viewport={viewport}
          prefix={prefix}
          {...(highlight ? { highlight } : {})}
          label={`Technical flat, ${label}`}
          testId={testId}
        />
      ) : null}
      <span
        className="pointer-events-none absolute top-2 left-2 rounded-md border bg-panel/95 px-2 py-0.5 text-[12px] font-medium"
        data-testid={`${testId}-label`}
      >
        {label}
      </span>
    </>
  );
}

// ── view one revision ────────────────────────────────────────────────────────

function RevisionView({ revisionId }: { revisionId: string }) {
  const { active } = useOrganization();
  const compare = useEditor((s) => s.compare);
  const canRestore = useEditor((s) => s.meta.capabilities.canRestore);
  const history = useRevisionHistory();
  const snap = useRevisionSnapshot(revisionId);
  const scene = useRenderedScene(active.id, snap.state);
  const content = useMemo(() => (scene ? sceneBounds(scene) : null), [scene]);
  const cam = useSharedViewport(content);
  const [restoring, setRestoring] = useState(false);
  const summary = history.items.find((r) => r.id === revisionId) ?? null;

  if (snap.isError)
    return (
      <div className="p-6">
        <ErrorState
          error={snap.error}
          title="We couldn’t open this revision"
          onRetry={() => void snap.refetch()}
        />
      </div>
    );
  const label = snap.data ? shortLabel(snap.data.displayId) : '…';
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="revision-view">
      <div
        role="status"
        className="flex flex-wrap items-center gap-2 border-b bg-panel px-3 py-1.5 text-[13px]"
        data-testid="revision-banner"
      >
        <EyeIcon className="size-4 text-primary" aria-hidden />
        <span className="font-semibold">Viewing {label} (read-only)</span>
        {snap.data ? (
          <>
            <span className="text-muted-foreground">
              {snap.data.displayId} · {snap.data.createdByName ?? 'Unknown'} ·{' '}
              {new Date(snap.data.createdAt).toLocaleString()}
            </span>
            <Badge
              variant="outline"
              className="gap-1"
              title="The stored content hash was re-checked"
            >
              <ShieldCheckIcon aria-hidden /> Integrity verified
            </Badge>
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={() => compare(revisionId, 'working')}
          >
            <GitCompareIcon aria-hidden /> Compare with working copy
          </Button>
          {canRestore && summary ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={() => setRestoring(true)}
            >
              <Undo2Icon aria-hidden /> Restore…
            </Button>
          ) : null}
          <BackButton />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <PanZoomArea
          viewport={cam.viewport}
          onViewport={cam.setViewport}
          onSize={cam.onSize}
          className="flex-1"
        >
          {snap.isPending ? (
            <div className="p-6">
              <LoadingState />
            </div>
          ) : (
            <FlatPane
              scene={scene}
              viewport={cam.viewport}
              label={label}
              prefix="view"
              testId="revision-flat"
            />
          )}
        </PanZoomArea>
        {snap.data?.changeSummary ? (
          <aside
            className="w-72 shrink-0 overflow-auto border-l bg-panel p-3 text-[12px]"
            aria-label="Revision summary"
          >
            <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Summary
            </h3>
            <p className="whitespace-pre-line">{snap.data.changeSummary}</p>
          </aside>
        ) : null}
      </div>
      <RestoreDialog revision={restoring ? summary : null} onClose={() => setRestoring(false)} />
    </div>
  );
}

// ── compare two sides ────────────────────────────────────────────────────────

function CompareView({ a, b }: { a: string; b: string }) {
  const { active } = useOrganization();
  const store = useEditorStore();
  const designId = useEditor((s) => s.meta.design.id);
  const version = useEditor((s) => s.server.version);
  const history = useRevisionHistory();
  const api = useRevisionsApi();
  const [mode, setMode] = useState<'side' | 'overlay'>('side');
  const [opacity, setOpacity] = useState(50);
  const [hovered, setHovered] = useState<string | null>(null);
  const A = useSide(a);
  const B = useSide(b);
  const sceneA = useRenderedScene(active.id, A.state);
  const sceneB = useRenderedScene(active.id, B.state);
  const content = useMemo(
    () => union(sceneA ? sceneBounds(sceneA) : null, sceneB ? sceneBounds(sceneB) : null),
    [sceneA, sceneB],
  );
  const cam = useSharedViewport(content);

  // The structured diff is computed by the server from the stored states (working copy included,
  // so pending edits are saved first).
  const [flushed, setFlushed] = useState(b !== 'working');
  useEffect(() => {
    if (b === 'working')
      void store
        .getState()
        .flush()
        .then(() => setFlushed(true));
  }, [b, store]);
  const diff = useQuery({
    queryKey: [...queryKeys.org(active.id).compare(designId, a, b), b === 'working' ? version : 0],
    queryFn: ({ signal }) => api.compare(a, b, signal),
    enabled: flushed,
  });
  const changed = useMemo(() => new Set(diff.data?.changedComponentIds ?? []), [diff.data]);
  const highlight = useMemo(() => (hovered ? new Set([hovered]) : changed), [hovered, changed]);

  const options = [
    ...history.items.map((r) => ({
      value: r.id,
      label: `${shortLabel(r.displayId)} · ${r.createdByName ?? ''}`.trim(),
    })),
  ];
  const setSides = (na: string, nb: string) => store.getState().compare(na, nb);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="compare-view">
      <div
        className="flex flex-wrap items-center gap-2 border-b bg-panel px-3 py-1.5 text-[13px]"
        role="toolbar"
        aria-label="Comparison"
      >
        <GitCompareIcon className="size-4 text-primary" aria-hidden />
        <span className="font-semibold">Compare</span>
        <label className="flex items-center gap-1 text-[12px]">
          <span className="text-muted-foreground">A</span>
          <SimpleSelect
            aria-label="Compare from"
            value={a}
            className="h-7 w-40 text-[12px]"
            onValueChange={(v) => setSides(v, b)}
            options={options}
          />
        </label>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Swap sides"
          disabled={b === 'working'}
          onClick={() => setSides(b, a)}
        >
          <ArrowLeftRightIcon />
        </Button>
        <label className="flex items-center gap-1 text-[12px]">
          <span className="text-muted-foreground">B</span>
          <SimpleSelect
            aria-label="Compare to"
            value={b}
            className="h-7 w-40 text-[12px]"
            onValueChange={(v) => setSides(a, v)}
            options={[{ value: 'working', label: 'Working copy' }, ...options]}
          />
        </label>
        <div
          className="flex items-center rounded-md border p-0.5"
          role="radiogroup"
          aria-label="Layout"
        >
          {(['side', 'overlay'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'rounded px-2 py-0.5 text-[12px]',
                mode === m ? 'bg-accent font-medium' : 'text-muted-foreground',
              )}
            >
              {m === 'side' ? 'Side by side' : 'Overlay'}
            </button>
          ))}
        </div>
        {mode === 'overlay' ? (
          <label className="flex items-center gap-1 text-[12px]">
            <span className="text-muted-foreground">A</span>
            <input
              type="range"
              min={0}
              max={100}
              value={opacity}
              aria-label="Opacity of B over A"
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
            <span className="text-muted-foreground">B</span>
          </label>
        ) : null}
        <Button size="icon-sm" variant="ghost" aria-label="Fit to view" onClick={cam.fit}>
          <MaximizeIcon />
        </Button>
        <div className="ml-auto">
          <BackButton />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {A.error || B.error ? (
          <div className="flex-1 p-6">
            <ErrorState error={A.error ?? B.error} title="We couldn’t open a revision" />
          </div>
        ) : mode === 'side' ? (
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-px bg-border">
            <PanZoomArea
              viewport={cam.viewport}
              onViewport={cam.setViewport}
              onSize={cam.onSize}
              testId="compare-pane-a"
            >
              <FlatPane
                scene={sceneA}
                viewport={cam.viewport}
                label={`A · ${A.label}`}
                prefix="cmp-a"
                highlight={highlight}
                testId="compare-a"
              />
            </PanZoomArea>
            <PanZoomArea
              viewport={cam.viewport}
              onViewport={cam.setViewport}
              testId="compare-pane-b"
            >
              <FlatPane
                scene={sceneB}
                viewport={cam.viewport}
                label={`B · ${B.label}`}
                prefix="cmp-b"
                highlight={highlight}
                testId="compare-b"
              />
            </PanZoomArea>
          </div>
        ) : (
          <PanZoomArea
            viewport={cam.viewport}
            onViewport={cam.setViewport}
            onSize={cam.onSize}
            className="flex-1"
            testId="compare-overlay"
          >
            {sceneA ? (
              <FlatSvg
                scene={sceneA}
                viewport={cam.viewport}
                prefix="ov-a"
                opacity={1 - opacity / 100}
                label={`Technical flat, A · ${A.label}`}
                testId="overlay-a"
              />
            ) : null}
            {sceneB ? (
              <FlatSvg
                scene={sceneB}
                viewport={cam.viewport}
                prefix="ov-b"
                opacity={opacity / 100}
                highlight={highlight}
                label={`Technical flat, B · ${B.label}`}
                testId="overlay-b"
              />
            ) : null}
            <span className="pointer-events-none absolute top-2 left-2 rounded-md border bg-panel/95 px-2 py-0.5 text-[12px] font-medium">
              A · {A.label} ({100 - opacity}%) · B · {B.label} ({opacity}%)
            </span>
          </PanZoomArea>
        )}
        <aside
          className="flex w-80 shrink-0 flex-col overflow-auto border-l bg-panel"
          aria-label="Differences"
        >
          <div className="flex items-center gap-1 border-b px-3 py-1.5 text-[12px]">
            <LockIcon className="size-3 text-muted-foreground" aria-hidden />
            <span data-testid="compare-sides">
              {A.label} → {B.label}
            </span>
          </div>
          {diff.isPending ? (
            <div className="p-3">
              <LoadingState />
            </div>
          ) : diff.isError ? (
            <div className="p-3">
              <ErrorState
                error={diff.error}
                title="We couldn’t compare these"
                onRetry={() => void diff.refetch()}
              />
            </div>
          ) : (
            <DiffList entries={diff.data.entries} onHover={setHovered} />
          )}
        </aside>
      </div>
    </div>
  );
}
