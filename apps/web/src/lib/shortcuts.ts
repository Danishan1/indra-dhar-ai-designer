/**
 * Keyboard shortcut registry (SPEC-007 §18, FR-EDT-127): shortcuts never fire while the user is
 * typing in an input, textarea, select or contenteditable element, unless explicitly allowed.
 * Combos: 'mod+k' (Ctrl on Windows/Linux, ⌘ on macOS), 'alt+1', 'shift+?', 'escape'.
 */
export interface ShortcutDefinition {
  id: string;
  combo: string;
  description: string;
  handler: (event: KeyboardEvent) => void;
  /** Fire even when focus is in a text field (e.g. 'escape', 'mod+s'). */
  allowInInputs?: boolean;
}

interface ParsedCombo {
  key: string;
  mod: boolean;
  alt: boolean;
  shift: boolean;
}

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

export function parseCombo(combo: string): ParsedCombo {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((p) => p.trim());
  const key = parts.at(-1) ?? '';
  return {
    key,
    mod: parts.includes('mod'),
    alt: parts.includes('alt'),
    shift: parts.includes('shift'),
  };
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
  const el = target as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return ![
      'button',
      'checkbox',
      'radio',
      'range',
      'reset',
      'submit',
      'color',
      'file',
      'image',
    ].includes(type);
  }
  return (
    el.isContentEditable || el.closest?.('[contenteditable=""],[contenteditable="true"]') != null
  );
}

function keyOf(event: KeyboardEvent): string {
  // Alt changes `event.key` on macOS (alt+1 → '¡'); fall back to the physical digit/letter.
  if (event.code.startsWith('Digit')) return event.code.slice(5);
  if (event.code.startsWith('Key') && event.altKey) return event.code.slice(3).toLowerCase();
  return event.key.toLowerCase();
}

export function matchesCombo(
  event: KeyboardEvent,
  combo: ParsedCombo,
  mac = isMacPlatform(),
): boolean {
  const mod = mac ? event.metaKey : event.ctrlKey;
  const otherMod = mac ? event.ctrlKey : event.metaKey;
  return (
    keyOf(event) === combo.key &&
    mod === combo.mod &&
    !otherMod &&
    event.altKey === combo.alt &&
    (combo.key === '?' || event.shiftKey === combo.shift)
  );
}

/** Human-readable combo for menus and tooltips: 'mod+k' → 'Ctrl+K' / '⌘K'. */
export function formatCombo(combo: string, mac = isMacPlatform()): string {
  const { key, mod, alt, shift } = parseCombo(combo);
  const label = key.length === 1 ? key.toUpperCase() : key[0]?.toUpperCase() + key.slice(1);
  if (mac) return `${mod ? '⌘' : ''}${alt ? '⌥' : ''}${shift ? '⇧' : ''}${label}`;
  return [mod && 'Ctrl', alt && 'Alt', shift && 'Shift', label].filter(Boolean).join('+');
}

export class ShortcutRegistry {
  private readonly shortcuts = new Map<string, ShortcutDefinition & { parsed: ParsedCombo }>();

  register(def: ShortcutDefinition): () => void {
    this.shortcuts.set(def.id, { ...def, parsed: parseCombo(def.combo) });
    return () => {
      if (this.shortcuts.get(def.id)?.handler === def.handler) this.shortcuts.delete(def.id);
    };
  }

  list(): ShortcutDefinition[] {
    return [...this.shortcuts.values()].map(({ parsed: _parsed, ...def }) => def);
  }

  /** Returns true when a shortcut handled the event. */
  handle(event: KeyboardEvent, mac = isMacPlatform()): boolean {
    if (event.defaultPrevented || event.isComposing) return false;
    const editable = isEditableTarget(event.target);
    for (const shortcut of this.shortcuts.values()) {
      if (editable && !shortcut.allowInInputs) continue;
      if (!matchesCombo(event, shortcut.parsed, mac)) continue;
      event.preventDefault();
      shortcut.handler(event);
      return true;
    }
    return false;
  }
}
