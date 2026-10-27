'use client';

import type { EditorState, RevisionSummary } from '@ai-designer/contracts';
import { peekRedo, TOOL_LABELS, zoomLabel } from '@ai-designer/editor-core';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  HandIcon,
  LockIcon,
  MousePointer2Icon,
  Redo2Icon,
  ShirtIcon,
  Undo2Icon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type MouseEvent, type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';

import { ErrorState, LoadingState } from '@/components/states/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';
import { cn } from '@/lib/utils';

import { editorApi } from './api';
import { GarmentCanvas } from './canvas/garment-canvas';
import { SceneProvider } from './canvas/scene-context';
import { ConflictDialog } from './components/conflict-dialog';
import { SaveStatusChip } from './components/save-status';
import { Placeholder, ToolButton, WorkspaceLayout } from './editor-workspace';
import { useEditorShortcuts } from './hooks/use-editor-shortcuts';
import { useUnsavedGuard } from './hooks/use-unsaved-guard';
import { LeftPanelContent, LeftPanelTabs } from './library/left-panel';
import { PropertiesPanel } from './properties/properties-panel';
import {
  createEditorStore,
  type EditorStore,
  selectCanRedo,
  selectCanUndo,
  selectHasUnsavedWork,
  selectRedoLabel,
  selectUndoLabel,
} from './store';
import { EditorStoreProvider, useEditor, useEditorStore } from './store-context';

const revLabel = (r: RevisionSummary | null) =>
  r ? `R${String(r.revisionNumber).padStart(3, '0')}` : null;

/** `/projects/{projectId}/designs/{designId}` — the design editor workspace (I15). */
export function EditorPage({ projectId, designId }: { projectId: string; designId: string }) {
  const { active } = useOrganization();
  const router = useRouter();
  const query = useQuery({
    queryKey: queryKeys.org(active.id).editorState(designId),
    queryFn: ({ signal }) => editorApi(active.id, designId).loadState(signal),
    // The store owns the state once open; never refetch underneath it.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const wrongProject = query.data && query.data.design.projectId !== projectId;
  useEffect(() => {
    if (wrongProject && query.data)
      router.replace(`/projects/${query.data.design.projectId}/designs/${designId}`);
  }, [wrongProject, query.data, designId, router]);

  if (query.isPending || wrongProject)
    return (
      <div className="p-6">
        <LoadingState />
      </div>
    );
  if (query.isError)
    return (
      <div className="p-6">
        <ErrorState
          error={query.error}
          title="We couldn’t open this design"
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  return <EditorSession key={designId} orgId={active.id} initial={query.data} />;
}

function EditorSession({ orgId, initial }: { orgId: string; initial: EditorState }) {
  const [store] = useState<EditorStore>(() =>
    createEditorStore(initial, {
      api: editorApi(orgId, initial.design.id),
      notify: {
        error: (message, details) =>
          toast.error(message, details?.length ? { description: details.join(' ') } : {}),
        info: (message) => toast.info(message),
      },
    }),
  );
  useEffect(() => () => store.getState().dispose(), [store]);
  return (
    <EditorStoreProvider store={store}>
      <SceneProvider>
        <Editor />
      </SceneProvider>
    </EditorStoreProvider>
  );
}

function Editor() {
  useEditorShortcuts();
  useUnsavedGuard();
  return (
    <>
      <WorkspaceLayout
        header={<EditorHeader />}
        tools={<EditorTools />}
        hierarchy={<LeftPanelContent />}
        hierarchyHeader={<LeftPanelTabs />}
        viewport={<GarmentCanvas />}
        properties={<PropertiesPanel />}
        operations={<HistoryList />}
        validation={<FindingsList />}
        jobs={<Placeholder>Generation jobs (I21).</Placeholder>}
        statusBar={<StatusBar />}
      />
      <ConflictDialog />
    </>
  );
}

// ── header ───────────────────────────────────────────────────────────────────

function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function EditorHeader() {
  const meta = useEditor((s) => s.meta);
  const version = useEditor((s) => s.server.version);
  const uncommitted = useEditor((s) => s.server.hasUncommittedChanges);
  const head = revLabel(meta.headRevision);
  const approved = revLabel(meta.approvedRevision);
  return (
    <>
      <LeaveLink href={`/projects/${meta.project.id}`} label={`Back to ${meta.project.name}`} />
      <ShirtIcon className="size-4 shrink-0 text-primary" aria-hidden />
      <div className="flex min-w-0 items-baseline gap-1.5">
        <h1 className="truncate text-[13px] font-semibold">{meta.design.name}</h1>
        <span className="truncate text-xs text-muted-foreground">
          {meta.project.name} · {meta.design.displayId}
        </span>
      </div>
      <Separator orientation="vertical" className="mx-1 h-5" />
      {/* Working copy vs latest revision vs approved revision (NFR-PRJ-013, FR-EDT-092). */}
      <ul aria-label="Design versions" className="flex items-center gap-1.5">
        <li>
          <Hint label="The draft you are editing. Every change is saved here; it is not a revision.">
            <Badge variant="secondary" data-testid="working-copy-badge">
              Working copy · v{version}
              {uncommitted ? ' · changed' : ''}
            </Badge>
          </Hint>
        </li>
        <li>
          <Hint label="Latest saved revision (immutable)">
            <Badge variant="outline" data-testid="latest-revision-badge">
              Latest {head ?? '—'}
            </Badge>
          </Hint>
        </li>
        <li>
          <Hint label="Revision approved for development">
            <Badge variant="outline" data-testid="approved-revision-badge">
              {approved ? `Approved ${approved}` : 'Not approved'}
            </Badge>
          </Hint>
        </li>
      </ul>
      {!meta.capabilities.canEdit ? (
        <Hint
          label={
            meta.readOnlyReason === 'project_status'
              ? 'This project is not active, so its designs are read-only.'
              : 'You can view this design but not edit it.'
          }
        >
          <Badge variant="outline" className="gap-1" data-testid="read-only-badge">
            <LockIcon aria-hidden /> Read-only
          </Badge>
        </Hint>
      ) : null}
      <div className="ml-auto">
        <SaveStatusConnected />
      </div>
    </>
  );
}

function SaveStatusConnected() {
  const save = useEditor((s) => s.save);
  const flush = useEditor((s) => s.flush);
  const openConflict = useEditor((s) => s.setConflictDialogOpen);
  return (
    <SaveStatusChip
      status={save.status}
      lastSavedAt={save.lastSavedAt}
      error={save.error}
      onRetry={() => void flush()}
      onResolve={() => openConflict(true)}
    />
  );
}

/** In-app navigation guard (FR-PRJ-018): saves first; asks before leaving unsaved changes behind. */
function LeaveLink({ href, label }: { href: string; label: string }) {
  const store = useEditorStore();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const onClick = async (e: MouseEvent) => {
    if (!selectHasUnsavedWork(store.getState())) return;
    e.preventDefault();
    await store.getState().flush();
    if (selectHasUnsavedWork(store.getState())) setConfirming(true);
    else router.push(href);
  };
  return (
    <>
      <Button asChild variant="ghost" size="icon-sm" aria-label={label}>
        <Link href={href} onClick={(e) => void onClick(e)}>
          <ArrowLeftIcon />
        </Link>
      </Button>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave with unsaved changes?</DialogTitle>
            <DialogDescription>
              Some changes are not saved yet. If you leave now they will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Stay
            </Button>
            <Button variant="destructive" onClick={() => router.push(href)}>
              Leave anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── toolbar ──────────────────────────────────────────────────────────────────

function EditorTools() {
  const canUndo = useEditor(selectCanUndo);
  const canRedo = useEditor(selectCanRedo);
  const undoLabel = useEditor(selectUndoLabel);
  const redoLabel = useEditor(selectRedoLabel);
  const tool = useEditor((s) => s.tool.active);
  const { undo, redo, setTool } = useEditor(
    useShallow((s) => ({ undo: s.undo, redo: s.redo, setTool: s.setTool })),
  );
  return (
    <>
      <ToolButton
        icon={MousePointer2Icon}
        label={TOOL_LABELS.select}
        combo="v"
        pressed={tool === 'select'}
        onClick={() => setTool('select')}
      />
      <ToolButton
        icon={HandIcon}
        label={TOOL_LABELS.pan}
        combo="h"
        pressed={tool === 'pan'}
        onClick={() => setTool('pan')}
      />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ToolButton
        icon={Undo2Icon}
        label="Undo"
        combo="mod+z"
        tooltip={undoLabel ? `Undo ${undoLabel}` : 'Undo'}
        disabled={!canUndo}
        onClick={() => void undo()}
      />
      <ToolButton
        icon={Redo2Icon}
        label="Redo"
        combo="mod+shift+z"
        tooltip={redoLabel ? `Redo ${redoLabel}` : 'Redo'}
        disabled={!canRedo}
        onClick={() => void redo()}
      />
      <Separator orientation="vertical" className="mx-1 h-5" />
    </>
  );
}

// ── panels ───────────────────────────────────────────────────────────────────

function HistoryList() {
  const history = useEditor((s) => s.history);
  const lastOperation = useEditor((s) => s.lastOperation);
  const undoSteps = [...history.undo].reverse();
  const redoNext = peekRedo(history);
  if (!undoSteps.length && !history.redo.length)
    return <Placeholder>No changes in this session yet.</Placeholder>;
  return (
    <div className="p-2 text-[13px]">
      <ol aria-label="Undo history" className="flex flex-col gap-0.5">
        {[...history.redo].map((e) => (
          <li key={e.id} className="px-1 text-muted-foreground line-through">
            {e.label} {e === redoNext ? <span className="no-underline">(redo next)</span> : null}
          </li>
        ))}
        {undoSteps.map((e, i) => (
          <li key={e.id} className={cn('px-1', i === 0 && 'font-medium')}>
            {e.label}
          </li>
        ))}
      </ol>
      {lastOperation ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Last saved operation {lastOperation.displayId}
        </p>
      ) : null}
    </div>
  );
}

function FindingsList() {
  const findings = useEditor((s) => s.findings);
  if (!findings.length) return <Placeholder>No findings for the last change.</Placeholder>;
  return (
    <ul aria-label="Findings" className="flex flex-col gap-1 p-2 text-[12px]">
      {findings.map((f, i) => (
        <li key={`${f.ruleId}-${String(i)}`}>
          <span className="font-medium">{f.outcome.replaceAll('_', ' ')}</span> · {f.message}
        </li>
      ))}
    </ul>
  );
}

function StatusBar() {
  const online = useEditor((s) => s.save.online);
  const selected = useEditor((s) => s.selection.ids.length);
  const zoom = useEditor((s) => zoomLabel(s.viewport));
  const tool = useEditor((s) => TOOL_LABELS[s.tool.active]);
  const pending = useEditor((s) => s.queue.queued.length + (s.queue.inFlight?.ops.length ?? 0));
  return (
    <>
      <span data-testid="connectivity">{online ? 'Online' : 'Offline — changes are kept'}</span>
      <span>{tool}</span>
      <span>{selected ? `${selected} selected` : 'Nothing selected'}</span>
      <span>Zoom {zoom}</span>
      {pending ? <span>{pending} pending</span> : null}
    </>
  );
}
