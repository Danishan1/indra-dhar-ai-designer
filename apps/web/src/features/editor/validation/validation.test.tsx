// @vitest-environment jsdom
import type { ValidationFindingView } from '@ai-designer/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ComponentFindings } from './component-findings';
import { kindOf, KIND_LABELS } from './severity';
import { ValidationContext, type ValidationState } from './validation-context';

afterEach(cleanup);

const f = (over: Partial<ValidationFindingView>): ValidationFindingView => ({
  findingId: `vf_${Math.random().toString(16).slice(2, 18)}`,
  ruleId: 'dependency.cuff_requires_sleeve',
  ruleVersion: '1.0.0',
  category: 'dependency',
  severity: 'blocking',
  outcome: 'error',
  entity: { entityType: 'design_component', entityId: 'cmp_cuff' },
  path: null,
  message: 'Left cuff sits on a sleeveless sleeve',
  resolution: 'Remove Left cuff',
  ...over,
});

const state = (findings: ValidationFindingView[], stale = false): ValidationState => ({
  run: null,
  stale,
  checking: false,
  error: null,
  rerun: () => undefined,
  byComponent: new Map([['cmp_cuff', findings]]),
});

describe('validation UI (I20)', () => {
  it('manual review is its own kind; severities are labelled in text (FR-EDT-119)', () => {
    expect(kindOf({ severity: 'warning', outcome: 'requires_manual_review' })).toBe('review');
    expect(kindOf({ severity: 'info', outcome: 'warning' })).toBe('info');
    expect(KIND_LABELS.blocking).toBe('Blocking');
  });

  it('lists a component’s findings worst first, without informative notes', () => {
    render(
      <ValidationContext.Provider
        value={state([
          f({ severity: 'warning', outcome: 'warning', message: 'Unusual length' }),
          f({}),
          f({ severity: 'info', outcome: 'warning', message: 'Not confirmed yet' }),
        ])}
      >
        <ComponentFindings componentId="cmp_cuff" />
      </ValidationContext.Provider>,
    );
    const box = screen.getByTestId('component-findings');
    expect(box.textContent).toContain('Blocking: Left cuff sits on a sleeveless sleeve');
    expect(box.textContent).toContain('→ Remove Left cuff');
    expect(box.textContent?.indexOf('Blocking')).toBeLessThan(box.textContent!.indexOf('Warning'));
    expect(box.textContent).not.toContain('Not confirmed yet');
  });

  it('marks stale results and renders nothing without findings', () => {
    const { rerender } = render(
      <ValidationContext.Provider value={state([f({})], true)}>
        <ComponentFindings componentId="cmp_cuff" />
      </ValidationContext.Provider>,
    );
    expect(screen.getByText(/updating/)).toBeTruthy();
    rerender(
      <ValidationContext.Provider value={state([])}>
        <ComponentFindings componentId="cmp_cuff" />
      </ValidationContext.Provider>,
    );
    expect(screen.queryByTestId('component-findings')).toBeNull();
  });
});
