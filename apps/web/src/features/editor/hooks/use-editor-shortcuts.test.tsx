// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';

import { ShortcutsProvider } from '@/lib/shortcuts-provider';

import type { EditorStore, EditorStoreState } from '../store';
import { EditorStoreProvider } from '../store-context';

import { useEditorShortcuts } from './use-editor-shortcuts';

afterEach(cleanup);

function Harness() {
  useEditorShortcuts();
  return <input aria-label="Name" />;
}

function setup() {
  const actions = {
    undo: vi.fn(() => Promise.resolve()),
    redo: vi.fn(() => Promise.resolve()),
    flush: vi.fn(() => Promise.resolve()),
    clearSelection: vi.fn(),
    setTool: vi.fn(),
  };
  const store = createStore(() => actions as unknown as EditorStoreState) as EditorStore;
  render(
    <ShortcutsProvider>
      <EditorStoreProvider store={store}>
        <Harness />
      </EditorStoreProvider>
    </ShortcutsProvider>,
  );
  return actions;
}

const ctrl = (key: string, extra: Partial<KeyboardEventInit> = {}) => ({
  key,
  code: `Key${key.toUpperCase()}`,
  ctrlKey: true,
  ...extra,
});

describe('editor shortcuts (FR-EDT-125…127)', () => {
  it('undo, redo, save and clear selection on the workspace', () => {
    const a = setup();
    fireEvent.keyDown(document.body, ctrl('z'));
    expect(a.undo).toHaveBeenCalledOnce();
    fireEvent.keyDown(document.body, ctrl('Z', { shiftKey: true }));
    fireEvent.keyDown(document.body, ctrl('y'));
    expect(a.redo).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document.body, ctrl('s'));
    expect(a.flush).toHaveBeenCalledOnce();
    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' });
    expect(a.clearSelection).toHaveBeenCalledOnce();
    fireEvent.keyDown(document.body, { key: 'h', code: 'KeyH' });
    expect(a.setTool).toHaveBeenCalledWith('pan');
  });

  it('does not fire while typing in a field — except save (AC7)', () => {
    const a = setup();
    const input = screen.getByLabelText('Name');
    fireEvent.keyDown(input, ctrl('z'));
    fireEvent.keyDown(input, ctrl('y'));
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
    fireEvent.keyDown(input, { key: 'v', code: 'KeyV' });
    expect(a.undo).not.toHaveBeenCalled();
    expect(a.redo).not.toHaveBeenCalled();
    expect(a.clearSelection).not.toHaveBeenCalled();
    expect(a.setTool).not.toHaveBeenCalled();
    fireEvent.keyDown(input, ctrl('s'));
    expect(a.flush).toHaveBeenCalledOnce();
  });
});
