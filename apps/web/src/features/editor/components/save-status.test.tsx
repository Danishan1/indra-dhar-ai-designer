// @vitest-environment jsdom
import { SAVE_STATUS_LABELS, SaveStatuses } from '@ai-designer/editor-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SaveStatusChip } from './save-status';

afterEach(cleanup);

describe('SaveStatusChip', () => {
  it.each(SaveStatuses)('renders %s with an icon and a text label', (status) => {
    render(<SaveStatusChip status={status} lastSavedAt="2026-10-27T10:00:00.000Z" />);
    const chip = screen.getByRole('status');
    expect(chip.getAttribute('data-save-status')).toBe(status);
    expect(chip.textContent).toBe(SAVE_STATUS_LABELS[status]);
    expect(chip.querySelector('svg')).not.toBeNull();
  });

  it('offers Retry only after a failed save, and Resolve only on conflict', () => {
    const onRetry = vi.fn();
    const onResolve = vi.fn();
    const { rerender } = render(
      <SaveStatusChip
        status="save_failed"
        lastSavedAt={null}
        error="Cannot reach the server"
        onRetry={onRetry}
        onResolve={onResolve}
      />,
    );
    expect(screen.getByRole('status').getAttribute('title')).toContain('Your changes are kept');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
    rerender(
      <SaveStatusChip
        status="conflict"
        lastSavedAt={null}
        onRetry={onRetry}
        onResolve={onResolve}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(onResolve).toHaveBeenCalledOnce();
    rerender(<SaveStatusChip status="saved" lastSavedAt={null} onRetry={onRetry} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
