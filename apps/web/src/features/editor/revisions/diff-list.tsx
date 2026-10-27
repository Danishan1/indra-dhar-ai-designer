'use client';

import type { DiffEntry } from '@ai-designer/contracts';
import { defaultCatalog } from '@ai-designer/garment-model';
import { MinusIcon, PencilIcon, PlusIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const human = (s: string) => s.replaceAll('_', ' ');

/** A value as people read it: enum labels, lengths in mm, colours with a swatch. */
export function formatDiffValue(entry: DiffEntry, value: unknown): ReactNode {
  if (value === null || value === undefined)
    return <span className="text-muted-foreground">—</span>;
  if (entry.category === 'property' && entry.field) {
    const def = defaultCatalog.properties.get(entry.field);
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value))
      return (
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block size-3 rounded-sm border"
            style={{ backgroundColor: value }}
            aria-hidden
          />
          {value}
        </span>
      );
    if (typeof value === 'number')
      return `${String(value)}${def?.unitKind === 'length' ? ' mm' : ''}`;
    if (typeof value === 'string') return human(value);
  }
  if (entry.category === 'artifact' && typeof value === 'string')
    return `revision ${value.slice(0, 8)}…`;
  if (typeof value === 'string') return human(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return 'changed';
}

const GROUPS: { id: string; title: string; match: (e: DiffEntry) => boolean }[] = [
  { id: 'structure', title: 'Components', match: (e) => e.category === 'structural' },
  {
    id: 'properties',
    title: 'Properties',
    match: (e) => e.category === 'property' && !e.visualOnly,
  },
  { id: 'artifacts', title: 'Artifacts', match: (e) => e.category === 'artifact' },
  {
    id: 'relationships',
    title: 'Relationships & placements',
    match: (e) => e.category === 'relationship',
  },
  {
    id: 'visual',
    title: 'Appearance only',
    match: (e) => e.category === 'property' && e.visualOnly,
  },
  {
    id: 'other',
    title: 'Not design changes (metadata, editor flags)',
    match: (e) => e.category === 'metadata' || e.category === 'editor_hint',
  },
];

const KIND_ICON = { added: PlusIcon, removed: MinusIcon, changed: PencilIcon } as const;

/**
 * The structured comparison (FR-EDT-094, FR-PRJ-031): grouped by what changed, appearance-only and
 * non-design changes listed separately. Hovering an entry highlights its component.
 */
export function DiffList({
  entries,
  onHover,
}: {
  entries: readonly DiffEntry[];
  onHover?: (componentId: string | null) => void;
}) {
  const semantic = entries.filter((e) => e.semantic).length;
  if (!entries.length)
    return (
      <p className="p-3 text-[13px] text-muted-foreground" data-testid="diff-empty">
        No differences.
      </p>
    );
  return (
    <div className="flex flex-col gap-3 p-3 text-[12px]" data-testid="diff-list">
      <p className="text-muted-foreground">
        {semantic} design {semantic === 1 ? 'change' : 'changes'}
        {entries.length > semantic ? ` · ${entries.length - semantic} other` : ''}
      </p>
      {GROUPS.map((g) => {
        const list = entries.filter(g.match);
        if (!list.length) return null;
        return (
          <section key={g.id} aria-label={g.title} data-diff-group={g.id}>
            <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {g.title} <Badge variant="outline">{list.length}</Badge>
            </h3>
            <ul className="flex flex-col gap-1">
              {list.map((e, i) => {
                const Icon = KIND_ICON[e.kind];
                return (
                  <li
                    key={`${e.entityId}-${e.field ?? ''}-${String(i)}`}
                    className={cn(
                      'flex flex-col gap-0.5 rounded-md border px-2 py-1',
                      !e.semantic && 'border-dashed text-muted-foreground',
                    )}
                    data-testid="diff-entry"
                    data-category={e.category}
                    data-component-id={e.componentId ?? undefined}
                    onMouseEnter={() => onHover?.(e.componentId)}
                    onMouseLeave={() => onHover?.(null)}
                  >
                    <span className="flex items-center gap-1 font-medium">
                      <Icon className="size-3 shrink-0" aria-label={e.kind} />
                      {e.label}
                    </span>
                    {e.kind === 'changed' ? (
                      <span className="flex flex-wrap items-center gap-1">
                        {formatDiffValue(e, e.before)} <span aria-hidden>→</span>
                        <span className="sr-only">changed to</span> {formatDiffValue(e, e.after)}
                        {e.statusBefore !== e.statusAfter && e.statusAfter ? (
                          <Badge variant="outline">
                            {human(e.statusBefore ?? 'none')} → {human(e.statusAfter)}
                          </Badge>
                        ) : e.statusAfter && e.statusAfter !== 'confirmed' ? (
                          <Badge variant="outline">{human(e.statusAfter)}</Badge>
                        ) : null}
                      </span>
                    ) : e.category === 'structural' && e.componentId ? (
                      <span className="text-muted-foreground">
                        {e.kind === 'added' ? 'Added' : 'Removed'}{' '}
                        {human(String(e.after ?? e.before))}
                      </span>
                    ) : (
                      <span>
                        {e.kind === 'added' ? 'Added' : 'Removed'}:{' '}
                        {formatDiffValue(e, e.kind === 'added' ? e.after : e.before)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
