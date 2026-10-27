'use client';

import { ValueStatuses } from '@ai-designer/contracts';
import {
  ArrowLeftIcon,
  BoxSelectIcon,
  type LucideIcon,
  MousePointer2Icon,
  PanelBottomIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PenToolIcon,
  ShirtIcon,
  ZoomInIcon,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, type RefObject, useCallback, useState } from 'react';
import {
  type PanelImperativeHandle,
  type PanelSize,
  useDefaultLayout,
  usePanelRef,
} from 'react-resizable-panels';

import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ValueStatusBadge } from '@/components/value-status-badge';
import { PreferenceKeys, preferenceStorage } from '@/lib/local-preferences';
import { formatCombo } from '@/lib/shortcuts';
import { useShortcut } from '@/lib/shortcuts-provider';
import { useIsClient } from '@/lib/use-is-client';
import { cn } from '@/lib/utils';

/** The six workspace regions of SPEC-007 §5. Tests and later iterations address them by name. */
export type EditorRegion =
  'header' | 'toolbar' | 'hierarchy' | 'viewport' | 'properties' | 'operations' | 'status';

export function Region({
  region,
  label,
  className,
  children,
}: {
  region: EditorRegion;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-region={region}
      aria-label={label}
      className={cn('flex h-full min-h-0 flex-col', className)}
    >
      {children}
    </section>
  );
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-8 shrink-0 items-center border-b px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </div>
  );
}

/** Collapsible-panel controller: collapsing/expanding is pure UI state — no data changes (FR-EDT-008). */
function useCollapsiblePanel(): {
  ref: RefObject<PanelImperativeHandle | null>;
  collapsed: boolean;
  toggle: () => void;
  onResize: (size: PanelSize) => void;
} {
  const ref = usePanelRef();
  const [collapsed, setCollapsed] = useState(false);
  const toggle = useCallback(() => {
    const panel = ref.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  }, [ref]);
  const onResize = useCallback((size: PanelSize) => setCollapsed(size.asPercentage === 0), []);
  return { ref, collapsed, toggle, onResize };
}

export function ToolButton({
  icon: Icon,
  label,
  combo,
  pressed,
  disabled,
  tooltip,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  combo?: string;
  pressed?: boolean;
  disabled?: boolean;
  /** Extra tooltip text, e.g. what Undo would undo. */
  tooltip?: string;
  onClick?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
          className={cn(pressed && 'bg-accent text-accent-foreground')}
          disabled={disabled}
          onClick={onClick}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {tooltip ?? label}
        {combo ? ` (${formatCombo(combo)})` : ''}
      </TooltipContent>
    </Tooltip>
  );
}

/** What a page puts into the workspace regions; the layout (panels, sizes, shortcuts) is shared. */
export interface WorkspaceSlots {
  header: ReactNode;
  /** Tool buttons at the start of the toolbar. */
  tools: ReactNode;
  hierarchy: ReactNode;
  /** Replaces the left panel's "Hierarchy" title row (e.g. Parts / Library tabs, I18). */
  hierarchyHeader?: ReactNode;
  viewport: ReactNode;
  properties: ReactNode;
  operations: ReactNode;
  validation: ReactNode;
  jobs: ReactNode;
  statusBar?: ReactNode;
}

function Workspace({
  header,
  tools,
  hierarchy: hierarchyContent,
  hierarchyHeader,
  viewport,
  properties: propertiesContent,
  operations: operationsContent,
  validation,
  jobs,
  statusBar,
}: WorkspaceSlots) {
  const hierarchy = useCollapsiblePanel();
  const properties = useCollapsiblePanel();
  const operations = useCollapsiblePanel();
  // Panel sizes are remembered per browser (FR-EDT-002/003); UI preference only.
  const mainLayout = useDefaultLayout({
    id: `${PreferenceKeys.editorLayoutPrefix}.main`,
    storage: preferenceStorage,
  });
  const centerLayout = useDefaultLayout({
    id: `${PreferenceKeys.editorLayoutPrefix}.center`,
    storage: preferenceStorage,
  });

  useShortcut({
    id: 'editor.toggle-hierarchy',
    combo: 'alt+1',
    description: 'Toggle hierarchy panel',
    handler: hierarchy.toggle,
  });
  useShortcut({
    id: 'editor.toggle-properties',
    combo: 'alt+2',
    description: 'Toggle properties panel',
    handler: properties.toggle,
  });
  useShortcut({
    id: 'editor.toggle-operations',
    combo: 'alt+3',
    description: 'Toggle operations panel',
    handler: operations.toggle,
  });

  return (
    <div className="flex h-full flex-col">
      <Region
        region="header"
        label="Editor header"
        className="h-10 flex-row items-center gap-2 border-b bg-panel px-2"
      >
        {header}
      </Region>

      <Region
        region="toolbar"
        label="Toolbar"
        className="h-9 flex-row items-center gap-0.5 border-b bg-panel px-2"
      >
        {tools}
        <div className="ml-auto flex items-center gap-0.5">
          <ToolButton
            icon={PanelLeftIcon}
            label="Hierarchy panel"
            combo="alt+1"
            pressed={!hierarchy.collapsed}
            onClick={hierarchy.toggle}
          />
          <ToolButton
            icon={PanelBottomIcon}
            label="Operations panel"
            combo="alt+3"
            pressed={!operations.collapsed}
            onClick={operations.toggle}
          />
          <ToolButton
            icon={PanelRightIcon}
            label="Properties panel"
            combo="alt+2"
            pressed={!properties.collapsed}
            onClick={properties.toggle}
          />
        </div>
      </Region>

      <ResizablePanelGroup
        id="editor-main"
        orientation="horizontal"
        className="min-h-0 flex-1"
        {...mainLayout}
      >
        <ResizablePanel
          id="hierarchy"
          panelRef={hierarchy.ref}
          onResize={hierarchy.onResize}
          defaultSize="18"
          minSize={180}
          maxSize="35"
          collapsible
          className="bg-panel"
        >
          <Region region="hierarchy" label="Hierarchy">
            {hierarchyHeader ?? <PanelTitle>Hierarchy</PanelTitle>}
            <div className="min-h-0 flex-1 overflow-auto">{hierarchyContent}</div>
          </Region>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize hierarchy panel" />
        <ResizablePanel id="center" minSize="30">
          <ResizablePanelGroup id="editor-center" orientation="vertical" {...centerLayout}>
            <ResizablePanel id="viewport" minSize="30">
              <Region region="viewport" label="Viewport" className="bg-viewport">
                {viewport}
              </Region>
            </ResizablePanel>
            <ResizableHandle aria-label="Resize operations panel" />
            <ResizablePanel
              id="operations"
              panelRef={operations.ref}
              onResize={operations.onResize}
              defaultSize="24"
              minSize={96}
              maxSize="60"
              collapsible
              className="bg-panel"
            >
              <Region region="operations" label="Operations and status">
                <Tabs defaultValue="operations" className="h-full gap-0">
                  <div className="flex h-8 shrink-0 items-center border-b px-2">
                    <TabsList className="h-6">
                      <TabsTrigger value="operations" className="text-xs">
                        Operations
                      </TabsTrigger>
                      <TabsTrigger value="validation" className="text-xs">
                        Validation
                      </TabsTrigger>
                      <TabsTrigger value="jobs" className="text-xs">
                        Jobs
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="operations" className="min-h-0 overflow-auto">
                    {operationsContent}
                  </TabsContent>
                  <TabsContent value="validation" className="min-h-0 overflow-auto">
                    {validation}
                  </TabsContent>
                  <TabsContent value="jobs" className="min-h-0 overflow-auto">
                    {jobs}
                  </TabsContent>
                </Tabs>
              </Region>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize properties panel" />
        <ResizablePanel
          id="properties"
          panelRef={properties.ref}
          onResize={properties.onResize}
          defaultSize="22"
          minSize={220}
          maxSize="40"
          collapsible
          className="bg-panel"
        >
          <Region region="properties" label="Properties">
            <PanelTitle>Properties</PanelTitle>
            <div className="min-h-0 flex-1 overflow-auto">{propertiesContent}</div>
          </Region>
        </ResizablePanel>
      </ResizablePanelGroup>
      {statusBar ? (
        <Region
          region="status"
          label="Status bar"
          className="h-6 flex-row items-center gap-3 border-t bg-panel px-2 text-[11px] text-muted-foreground"
        >
          {statusBar}
        </Region>
      ) : null}
    </div>
  );
}

export function WorkspaceSkeleton() {
  return (
    <div className="flex h-full flex-col gap-px" aria-busy="true">
      <Skeleton className="h-10 rounded-none" />
      <Skeleton className="h-9 rounded-none" />
      <Skeleton className="flex-1 rounded-none opacity-50" />
    </div>
  );
}

/** The workspace layout. Rendered on the client only: panel sizes come from local storage. */
export function WorkspaceLayout(slots: WorkspaceSlots) {
  const isClient = useIsClient();
  if (!isClient) return <WorkspaceSkeleton />;
  return <Workspace {...slots} />;
}

export const Placeholder = ({ children }: { children: ReactNode }) => (
  <div className="p-3 text-[13px] text-muted-foreground">{children}</div>
);

export const ViewportPlaceholder = ({ children }: { children: ReactNode }) => (
  <div className="relative flex flex-1 items-center justify-center bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:16px_16px]">
    {children}
  </div>
);

/** Layout preview with placeholder content (`/editor/demo`). */
export function EditorWorkspace({ title }: { title: string }) {
  return (
    <WorkspaceLayout
      header={
        <>
          <Button asChild variant="ghost" size="icon-sm" aria-label="Back to home">
            <Link href="/">
              <ArrowLeftIcon />
            </Link>
          </Button>
          <ShirtIcon className="size-4 text-primary" aria-hidden />
          <h1 className="truncate text-[13px] font-semibold">{title}</h1>
          <span className="text-xs text-muted-foreground">· working copy (preview)</span>
        </>
      }
      tools={
        <>
          <ToolButton icon={MousePointer2Icon} label="Select" pressed />
          <ToolButton icon={BoxSelectIcon} label="Region select" />
          <ToolButton icon={PenToolIcon} label="Annotate" />
          <ToolButton icon={ZoomInIcon} label="Zoom" />
          <Separator orientation="vertical" className="mx-1 h-5" />
        </>
      }
      hierarchy={<Placeholder>Garment components appear here (I17).</Placeholder>}
      viewport={
        <ViewportPlaceholder>
          <span className="rounded-md border bg-panel/80 px-3 py-1.5 text-[13px] text-muted-foreground">
            2D garment viewport (I16)
          </span>
        </ViewportPlaceholder>
      }
      properties={
        <div className="flex flex-col gap-3 p-3 text-[13px]">
          <p className="text-muted-foreground">Contextual properties of the selection (I17).</p>
          <ValueStatusLegend />
        </div>
      }
      operations={<Placeholder>Operation history (I14/I15).</Placeholder>}
      validation={<Placeholder>Validation findings (I20).</Placeholder>}
      jobs={<Placeholder>Generation jobs (I21).</Placeholder>}
    />
  );
}

export function ValueStatusLegend() {
  return (
    <div>
      <h2 className="mb-1.5 text-xs font-medium text-muted-foreground">Value status legend</h2>
      <ul className="flex flex-wrap gap-1.5">
        {ValueStatuses.map((status) => (
          <li key={status}>
            <ValueStatusBadge status={status} />
          </li>
        ))}
      </ul>
    </div>
  );
}
