// @vitest-environment jsdom
import type { DiffEntry } from '@ai-designer/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DiffList } from './diff-list';

afterEach(cleanup);

const base = {
  kind: 'changed',
  componentId: 'cmp_sleeve00001',
  entityId: 'cmp_sleeve00001',
  statusBefore: null,
  statusAfter: null,
  visualOnly: false,
  semantic: true,
} as const;

const entries: DiffEntry[] = [
  {
    ...base,
    category: 'property',
    field: 'dimension.sleeve_length',
    label: 'Left sleeve · Sleeve length',
    before: 600,
    after: 640,
    statusBefore: 'confirmed',
    statusAfter: 'confirmed',
  },
  {
    ...base,
    category: 'property',
    field: 'appearance.color',
    label: 'Left sleeve · Colour',
    before: '#ffffff',
    after: '#1e3a8a',
    visualOnly: true,
  },
  {
    ...base,
    category: 'structural',
    kind: 'removed',
    componentId: 'cmp_pocket00001',
    entityId: 'cmp_pocket00001',
    field: null,
    label: 'Chest pocket',
    before: 'pocket',
    after: null,
  },
  {
    ...base,
    category: 'editor_hint',
    field: 'visible',
    label: 'Left sleeve · visibility (editor only)',
    before: true,
    after: false,
    semantic: false,
  },
];

describe('DiffList (I19)', () => {
  it('groups changes and keeps appearance-only and non-design changes apart', () => {
    render(<DiffList entries={entries} />);
    expect(screen.getByText('3 design changes · 1 other')).toBeTruthy();
    const props = screen.getByRole('region', { name: 'Properties' });
    expect(within(props).getByText('Left sleeve · Sleeve length')).toBeTruthy();
    expect(within(props).getByText(/640 mm/)).toBeTruthy();
    expect(within(props).queryByText('Left sleeve · Colour')).toBeNull();
    expect(
      within(screen.getByRole('region', { name: 'Appearance only' })).getByText('#1e3a8a'),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Components' })).getByText('Removed pocket'),
    ).toBeTruthy();
    expect(
      within(
        screen.getByRole('region', { name: 'Not design changes (metadata, editor flags)' }),
      ).getByText('Left sleeve · visibility (editor only)'),
    ).toBeTruthy();
  });

  it('reports hovered components for highlighting', () => {
    const onHover = vi.fn();
    render(<DiffList entries={entries} onHover={onHover} />);
    fireEvent.mouseEnter(screen.getByText('Chest pocket').closest('li')!);
    expect(onHover).toHaveBeenLastCalledWith('cmp_pocket00001');
  });

  it('says when there is nothing to show', () => {
    render(<DiffList entries={[]} />);
    expect(screen.getByTestId('diff-empty').textContent).toBe('No differences.');
  });
});
