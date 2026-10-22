// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { formatCombo, isEditableTarget, ShortcutRegistry } from './shortcuts';

function press(target: EventTarget, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('ShortcutRegistry', () => {
  function setup(allowInInputs?: boolean) {
    const registry = new ShortcutRegistry();
    const handler = vi.fn();
    registry.register({
      id: 't',
      combo: 'mod+k',
      description: 'test',
      handler,
      ...(allowInInputs ? { allowInInputs } : {}),
    });
    document.addEventListener('keydown', (e) => registry.handle(e, false));
    return { registry, handler };
  }

  it('fires on the matching combo (Ctrl on non-mac) and prevents default', () => {
    const { handler } = setup();
    const event = press(document.body, { key: 'k', code: 'KeyK', ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    press(document.body, { key: 'k', code: 'KeyK' });
    press(document.body, { key: 'k', code: 'KeyK', ctrlKey: true, shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores events from inputs, textareas, selects and contenteditable (FR-EDT-127)', () => {
    const { registry } = setup();
    const handler = vi.fn();
    registry.register({ id: 'b', combo: 'alt+1', description: 'b', handler });
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.append(input, textarea, editable);
    for (const el of [input, textarea, editable])
      press(el, { key: '1', code: 'Digit1', altKey: true });
    expect(handler).not.toHaveBeenCalled();
    press(document.body, { key: '¡', code: 'Digit1', altKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('can opt a shortcut into firing inside inputs', () => {
    const { handler } = setup(true);
    const input = document.createElement('input');
    document.body.append(input);
    press(input, { key: 'k', code: 'KeyK', ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('unregisters', () => {
    const registry = new ShortcutRegistry();
    const off = registry.register({
      id: 'x',
      combo: 'escape',
      description: 'x',
      handler: () => undefined,
    });
    expect(registry.list()).toHaveLength(1);
    off();
    expect(registry.list()).toHaveLength(0);
  });
});

describe('helpers', () => {
  it('treats buttons and checkboxes as non-editable', () => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    expect(isEditableTarget(checkbox)).toBe(false);
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
  });

  it('formats combos per platform', () => {
    expect(formatCombo('mod+k', false)).toBe('Ctrl+K');
    expect(formatCombo('mod+k', true)).toBe('⌘K');
    expect(formatCombo('alt+1', false)).toBe('Alt+1');
  });
});
