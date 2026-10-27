/**
 * Selection by stable entity id (component ids, later bindings/relationships). Editor-local state:
 * never stored in the working copy (SPEC-007 §20). Immutable.
 */
export interface Selection {
  /** Selected ids in selection order. */
  readonly ids: readonly string[];
  /** The most recently selected id (drives the properties panel); null when empty. */
  readonly primary: string | null;
}

export type SelectMode = 'replace' | 'add' | 'toggle';

export const emptySelection: Selection = { ids: [], primary: null };

export function select(sel: Selection, id: string, mode: SelectMode = 'replace'): Selection {
  if (mode === 'replace') return { ids: [id], primary: id };
  const has = sel.ids.includes(id);
  if (mode === 'add') {
    if (has) return sel.primary === id ? sel : { ...sel, primary: id };
    return { ids: [...sel.ids, id], primary: id };
  }
  // toggle
  if (!has) return { ids: [...sel.ids, id], primary: id };
  const ids = sel.ids.filter((x) => x !== id);
  return { ids, primary: sel.primary === id ? (ids.at(-1) ?? null) : sel.primary };
}

export function selectMany(ids: readonly string[]): Selection {
  const unique = [...new Set(ids)];
  return { ids: unique, primary: unique.at(-1) ?? null };
}

export const clearSelection = (sel: Selection): Selection =>
  sel.ids.length === 0 ? sel : emptySelection;

export const isSelected = (sel: Selection, id: string): boolean => sel.ids.includes(id);

/** Drops ids that no longer exist (after an undo, a reload or another person's change). */
export function pruneSelection(sel: Selection, exists: (id: string) => boolean): Selection {
  const ids = sel.ids.filter(exists);
  if (ids.length === sel.ids.length) return sel;
  const primary = sel.primary && exists(sel.primary) ? sel.primary : (ids.at(-1) ?? null);
  return { ids, primary };
}
