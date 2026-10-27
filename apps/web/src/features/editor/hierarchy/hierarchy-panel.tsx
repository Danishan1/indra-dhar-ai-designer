'use client';

import { createComponentId, type DesignComponent } from '@ai-designer/garment-model';
import {
  BoxIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  type LucideIcon,
  MoreHorizontalIcon,
  RectangleVerticalIcon,
  ScissorsIcon,
  ShirtIcon,
  SquareDashedIcon,
  UnlockIcon,
} from 'lucide-react';
import { type KeyboardEvent, type MouseEvent, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { selectModeFor } from '../canvas/hit-test';
import { useScene } from '../canvas/scene-context';
import { useEditor } from '../store-context';

import { canSaveAsArtifact, SaveArtifactDialog } from './save-artifact-dialog';
import { addableChildren, flattenTree, type TreeNode, useTree } from './use-hierarchy';

const ICONS: Record<string, LucideIcon> = {
  garment_body: ShirtIcon,
  front_body_panel: RectangleVerticalIcon,
  back_body_panel: RectangleVerticalIcon,
  pocket: BoxIcon,
  hem: ScissorsIcon,
  cuff: CircleIcon,
  decorative_region: SquareDashedIcon,
  artwork_placement_region: SquareDashedIcon,
};

/**
 * Component hierarchy (FR-EDT-018…027): an ARIA tree with keyboard navigation (arrows, Home/End,
 * Enter/Space to select, Shift adds, Ctrl/Cmd toggles, F2 renames). Selection is shared with the
 * canvas and the properties panel. Visibility and lock are editing aids — they never change the
 * garment's geometry or appear as design changes (FR-EDT-023/024).
 */
export function HierarchyPanel() {
  const components = useEditor((s) => s.display.components);
  const selected = useEditor((s) => s.selection.ids);
  const canEdit = useEditor((s) => s.meta.capabilities.canEdit);
  const select = useEditor((s) => s.select);
  const apply = useEditor((s) => s.apply);
  const scene = useScene();
  const tree = useTree(components);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo(() => flattenTree(tree, collapsed), [tree, collapsed]);
  const [focused, setFocused] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<DesignComponent | null>(null);
  const [saving, setSaving] = useState<DesignComponent | null>(null);
  const canSaveArtifacts = useEditor((s) => s.meta.capabilities.canCreateArtifacts);
  const refs = useRef(new Map<string, HTMLDivElement>());

  const focusedId =
    focused && rows.some((r) => r.component.componentId === focused)
      ? focused
      : (selected[0] ?? rows[0]?.component.componentId ?? null);

  const moveFocus = (id: string | undefined) => {
    if (!id) return;
    setFocused(id);
    refs.current.get(id)?.focus();
  };
  const toggleCollapse = (id: string, open?: boolean) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      const isOpen = !next.has(id);
      if (open === undefined ? isOpen : !open) next.add(id);
      else next.delete(id);
      return next;
    });

  const onKeyDown = (e: KeyboardEvent) => {
    if (renaming) return;
    const i = rows.findIndex((r) => r.component.componentId === focusedId);
    const row = rows[i];
    if (!row) return;
    const id = row.component.componentId;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    switch (e.key) {
      case 'ArrowDown':
        handled();
        moveFocus(rows[i + 1]?.component.componentId);
        break;
      case 'ArrowUp':
        handled();
        moveFocus(rows[i - 1]?.component.componentId);
        break;
      case 'Home':
        handled();
        moveFocus(rows[0]?.component.componentId);
        break;
      case 'End':
        handled();
        moveFocus(rows.at(-1)?.component.componentId);
        break;
      case 'ArrowRight':
        handled();
        if (row.children.length && collapsed.has(id)) toggleCollapse(id, true);
        else moveFocus(row.children[0]?.component.componentId);
        break;
      case 'ArrowLeft':
        handled();
        if (row.children.length && !collapsed.has(id)) toggleCollapse(id, false);
        else moveFocus(row.component.parentComponentId ?? undefined);
        break;
      case 'Enter':
      case ' ':
        handled();
        select(id, selectModeFor(e));
        break;
      case 'F2':
        if (canEdit && !row.component.locked) {
          handled();
          setRenaming(id);
        }
        break;
    }
  };

  const rename = (c: DesignComponent, name: string) => {
    setRenaming(null);
    const trimmed = name.trim();
    if (trimmed && trimmed !== c.displayName)
      apply(
        { type: 'rename_component', componentId: c.componentId, displayName: trimmed },
        { label: `Rename ${c.displayName}` },
      );
  };

  const remove = (c: DesignComponent) => {
    const hasChildren = components.some((x) => x.parentComponentId === c.componentId);
    apply(
      { type: 'remove_component', componentId: c.componentId, cascade: hasChildren },
      { label: `Remove ${c.displayName}` },
    );
    setRemoving(null);
  };

  return (
    <>
      <div
        role="tree"
        aria-label="Components"
        aria-multiselectable="true"
        className="flex flex-col py-1 text-[13px]"
        onKeyDown={onKeyDown}
      >
        {rows.map((row) => (
          <TreeRow
            key={row.component.componentId}
            row={row}
            refCallback={(el) => {
              if (el) refs.current.set(row.component.componentId, el);
              else refs.current.delete(row.component.componentId);
            }}
            selected={selected.includes(row.component.componentId)}
            focused={focusedId === row.component.componentId}
            expanded={row.children.length ? !collapsed.has(row.component.componentId) : undefined}
            drawn={scene.components[row.component.componentId]?.supported !== false}
            canEdit={canEdit}
            renaming={renaming === row.component.componentId}
            components={components}
            onToggle={() => toggleCollapse(row.component.componentId)}
            onClick={(e) => {
              setFocused(row.component.componentId);
              select(row.component.componentId, selectModeFor(e));
            }}
            onRename={(name) => rename(row.component, name)}
            onCancelRename={() => setRenaming(null)}
            onStartRename={() => setRenaming(row.component.componentId)}
            onSaveAsArtifact={
              canSaveArtifacts && canSaveAsArtifact(row.component)
                ? () => setSaving(row.component)
                : undefined
            }
            onRemove={() =>
              components.some((x) => x.parentComponentId === row.component.componentId)
                ? setRemoving(row.component)
                : remove(row.component)
            }
          />
        ))}
      </div>
      {saving ? <SaveArtifactDialog component={saving} onClose={() => setSaving(null)} /> : null}
      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.displayName}?</DialogTitle>
            <DialogDescription>
              Its parts (
              {components
                .filter((x) => x.parentComponentId === removing?.componentId)
                .map((x) => x.displayName)
                .join(', ')}
              ) are removed too. You can undo this.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => removing && remove(removing)}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TreeRow({
  row,
  refCallback,
  selected,
  focused,
  expanded,
  drawn,
  canEdit,
  renaming,
  components,
  onToggle,
  onClick,
  onRename,
  onCancelRename,
  onStartRename,
  onSaveAsArtifact,
  onRemove,
}: {
  row: TreeNode;
  refCallback: (el: HTMLDivElement | null) => void;
  selected: boolean;
  focused: boolean;
  expanded: boolean | undefined;
  drawn: boolean;
  canEdit: boolean;
  renaming: boolean;
  components: readonly DesignComponent[];
  onToggle: () => void;
  onClick: (e: MouseEvent) => void;
  onRename: (name: string) => void;
  onCancelRename: () => void;
  onStartRename: () => void;
  onSaveAsArtifact: (() => void) | undefined;
  onRemove: () => void;
}) {
  const apply = useEditor((s) => s.apply);
  const select = useEditor((s) => s.select);
  const c = row.component;
  const Icon = ICONS[c.componentType] ?? CircleIcon;
  const addable = canEdit && !c.locked ? addableChildren(c, components) : [];
  return (
    <div
      ref={refCallback}
      role="treeitem"
      aria-level={row.depth}
      aria-selected={selected}
      aria-expanded={expanded}
      aria-label={c.displayName}
      data-component-id={c.componentId}
      tabIndex={focused ? 0 : -1}
      className={cn(
        'group flex h-7 cursor-default items-center gap-1 pr-1 outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'bg-accent text-accent-foreground',
        !c.visible && 'text-muted-foreground',
      )}
      style={{ paddingLeft: 4 + (row.depth - 1) * 14 }}
      onClick={onClick}
      onDoubleClick={() => canEdit && !c.locked && onStartRename()}
    >
      {expanded === undefined ? (
        <span className="w-4" />
      ) : (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          className="flex size-4 items-center justify-center text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {expanded ? (
            <ChevronDownIcon className="size-3.5" />
          ) : (
            <ChevronRightIcon className="size-3.5" />
          )}
        </button>
      )}
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      {renaming ? (
        <input
          autoFocus
          aria-label={`New name for ${c.displayName}`}
          defaultValue={c.displayName}
          maxLength={120}
          className="h-6 min-w-0 flex-1 rounded border bg-background px-1 text-[13px]"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') onRename(e.currentTarget.value);
            if (e.key === 'Escape') onCancelRename();
          }}
          onBlur={(e) => onRename(e.currentTarget.value)}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{c.displayName}</span>
      )}
      {!drawn ? (
        <span
          title="Not drawn in 2D yet — select it here to edit its properties"
          className="text-[10px] text-muted-foreground"
        >
          (no 2D)
        </span>
      ) : null}
      {c.locked ? <LockIcon className="size-3 text-muted-foreground" aria-label="Locked" /> : null}
      {canEdit ? (
        <span className="flex items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 group-aria-selected:opacity-100">
          <IconToggle
            label={c.visible ? `Hide ${c.displayName}` : `Show ${c.displayName}`}
            icon={c.visible ? EyeIcon : EyeOffIcon}
            onClick={() =>
              apply(
                {
                  type: 'set_component_visibility',
                  componentId: c.componentId,
                  visible: !c.visible,
                },
                { label: c.visible ? `Hide ${c.displayName}` : `Show ${c.displayName}` },
              )
            }
          />
          <IconToggle
            label={c.locked ? `Unlock ${c.displayName}` : `Lock ${c.displayName}`}
            icon={c.locked ? LockIcon : UnlockIcon}
            onClick={() =>
              apply(
                { type: 'set_component_lock', componentId: c.componentId, locked: !c.locked },
                { label: c.locked ? `Unlock ${c.displayName}` : `Lock ${c.displayName}` },
              )
            }
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Actions for ${c.displayName}`}
                className="flex size-5 items-center justify-center rounded hover:bg-background"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontalIcon className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem disabled={c.locked} onSelect={onStartRename}>
                Rename
              </DropdownMenuItem>
              {addable.length ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Add to {c.displayName}
                  </DropdownMenuLabel>
                  {addable.map((a) => (
                    <DropdownMenuItem
                      key={`${a.type}-${a.side}`}
                      disabled={!!a.disabledReason}
                      title={a.disabledReason ?? undefined}
                      onSelect={() => {
                        const id = createComponentId();
                        if (
                          apply(
                            {
                              type: 'add_component',
                              componentId: id,
                              componentType: a.type,
                              parentComponentId: c.componentId,
                              side: a.side,
                            },
                            { label: `Add ${a.label.toLowerCase()}` },
                          )
                        )
                          select(id);
                      }}
                    >
                      {a.label}
                    </DropdownMenuItem>
                  ))}
                </>
              ) : null}
              {onSaveAsArtifact ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onSaveAsArtifact}>Save as artifact…</DropdownMenuItem>
                </>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={c.locked || c.parentComponentId === null}
                className="text-destructive"
                onSelect={onRemove}
              >
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ) : null}
    </div>
  );
}

function IconToggle({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Icon className="size-3.5" />
    </button>
  );
}
