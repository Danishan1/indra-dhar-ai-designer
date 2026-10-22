// @vitest-environment jsdom
import { ValueStatuses, ValueStatusLabels } from '@ai-designer/contracts';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ValueStatusBadge } from './value-status-badge';

describe('ValueStatusBadge', () => {
  it.each(ValueStatuses)('renders %s with an icon and a text label (not color only)', (status) => {
    const { container } = render(<ValueStatusBadge status={status} compact />);
    const badge = container.querySelector(`[data-status="${status}"]`);
    expect(badge?.querySelector('svg')).not.toBeNull();
    expect(badge?.textContent).toBe(ValueStatusLabels[status]);
    expect(badge?.getAttribute('title')).toBe(ValueStatusLabels[status]);
  });
});
