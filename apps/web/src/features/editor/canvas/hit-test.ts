/**
 * Hit-testing: the element under the pointer carries its canonical component id
 * (`data-component-id`), so selection works on the structured model, not on pixels (FR-RV-022).
 */
export function componentIdFromTarget(target: EventTarget | null): string | null {
  let el = target as Element | null;
  while (el && typeof el.getAttribute === 'function') {
    const id = el.getAttribute('data-component-id');
    if (id) return id;
    if (el.tagName.toLowerCase() === 'svg') return null;
    el = el.parentElement;
  }
  return null;
}

/** Selection mode from modifier keys: Shift adds, Ctrl/Cmd toggles. */
export const selectModeFor = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) =>
  e.shiftKey
    ? ('add' as const)
    : e.ctrlKey || e.metaKey
      ? ('toggle' as const)
      : ('replace' as const);
