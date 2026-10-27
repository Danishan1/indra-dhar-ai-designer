// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { componentIdFromTarget, selectModeFor } from './hit-test';

describe('canvas hit-testing', () => {
  it('resolves the canonical component id from the element under the pointer', () => {
    document.body.innerHTML = `<svg><g data-component-id="cmp_outer0001"><path id="p1"/></g><path id="p2" data-component-id="cmp_sleeve001"/><rect id="bg"/></svg>`;
    expect(componentIdFromTarget(document.getElementById('p2'))).toBe('cmp_sleeve001');
    expect(componentIdFromTarget(document.getElementById('p1'))).toBe('cmp_outer0001');
    expect(componentIdFromTarget(document.getElementById('bg'))).toBeNull();
    expect(componentIdFromTarget(null)).toBeNull();
  });

  it('maps modifier keys to selection modes', () => {
    const k = { shiftKey: false, ctrlKey: false, metaKey: false };
    expect(selectModeFor(k)).toBe('replace');
    expect(selectModeFor({ ...k, shiftKey: true })).toBe('add');
    expect(selectModeFor({ ...k, metaKey: true })).toBe('toggle');
  });
});
