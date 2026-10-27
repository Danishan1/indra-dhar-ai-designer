// @vitest-environment jsdom
import type { EditorState, SubmitOperationResponse } from '@ai-designer/contracts';
import {
  defaultCatalog,
  sequentialRandomBytes,
  templates,
  type PropertyDefinition,
} from '@ai-designer/garment-model';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEditorStore } from '../store';
import { EditorStoreProvider } from '../store-context';

import { PropertyRow } from './property-row';

afterEach(cleanup);

const state = templates.create('woven_shirt', { randomBytes: sequentialRandomBytes() });
const sleeve = state.components.find((c) => c.componentType === 'sleeve')!;

function setup(canEdit = true) {
  const submit = vi.fn(() => new Promise<SubmitOperationResponse>(() => {}));
  const store = createEditorStore(
    {
      design: { id: 'd1', workingCopyVersion: 1 },
      project: { id: 'p1', name: 'P', displayId: 'PRJ', status: 'ACTIVE', editable: true },
      workingCopy: {
        version: 1,
        state,
        hasUncommittedChanges: false,
        findings: [],
        updatedAt: '2026-10-27T10:00:00.000Z',
      },
      capabilities: {
        canEdit,
        canCommit: canEdit,
        canRestore: canEdit,
        canGenerate: false,
        canUseArtifacts: canEdit,
        canCreateArtifacts: canEdit,
        canPublishArtifacts: false,
      },
      readOnlyReason: null,
      userId: 'u1',
    } as unknown as EditorState,
    {
      api: { submit, loadState: vi.fn() },
      notify: { error: vi.fn(), info: vi.fn() },
      debounceMs: 10_000,
    },
  );
  const def = defaultCatalog.properties.get('dimension.sleeve_length') as PropertyDefinition;
  render(
    <EditorStoreProvider store={store}>
      <PropertyRow
        def={def}
        pv={sleeve.properties['dimension.sleeve_length']}
        targets={[{ componentId: sleeve.componentId, label: sleeve.displayName }]}
        unit="cm"
        editable={canEdit}
        disabledReason={null}
        conflict={false}
      />
    </EditorStoreProvider>,
  );
  return { store, submit };
}

describe('PropertyRow', () => {
  it('shows a validation error and does not submit an invalid number (AC3)', () => {
    const { store } = setup();
    const input = screen.getByRole('textbox', { name: 'Sleeve length' });
    fireEvent.change(input, { target: { value: '-4' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toContain('A length cannot be negative');
    expect(store.getState().queue.queued).toHaveLength(0);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('queues one confirmed set_property in the chosen unit', () => {
    const { store } = setup();
    const input = screen.getByRole('textbox', { name: 'Sleeve length' });
    fireEvent.change(input, { target: { value: '62' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByRole('alert')).toBeNull();
    const [op] = store.getState().queue.queued;
    expect(op?.operation).toMatchObject({
      type: 'set_property',
      key: 'dimension.sleeve_length',
      value: 62,
      unit: 'cm',
      status: 'confirmed',
    });
    expect(op?.label).toBe('Set sleeve length');
  });

  it('status badge is text + icon and read-only users get no edit control', () => {
    setup(false);
    expect(screen.getByRole('textbox', { name: 'Sleeve length' })).toHaveProperty('disabled', true);
    const badge = document.querySelector('[data-status="missing"]');
    expect(badge?.textContent).toBe('Missing');
    expect(badge?.querySelector('svg')).not.toBeNull();
  });
});
