import {
  ArtifactCategories,
  checkCompatibility,
  validateArtifactRevision,
} from '@ai-designer/garment-model';
import { describe, expect, it } from 'vitest';

import { PLATFORM_LIBRARY } from './library.js';

describe('built-in artifact library (FR-050, ADR-008)', () => {
  it('has 30–60 valid items with unique, permanent keys', () => {
    expect(PLATFORM_LIBRARY.length).toBeGreaterThanOrEqual(30);
    expect(PLATFORM_LIBRARY.length).toBeLessThanOrEqual(60);
    const keys = PLATFORM_LIBRARY.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const spec of PLATFORM_LIBRARY) {
      expect(spec.key.startsWith(`${spec.category}.`), spec.key).toBe(true);
      const v = validateArtifactRevision(spec.definition, {
        visual: spec.visual ?? {},
        physical: spec.physical ?? {},
      });
      expect(v.findings, spec.key).toEqual([]);
      expect(v.definition?.previewSvg, spec.key).toMatch(
        /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/,
      );
      expect(v.definition?.previewSvg, spec.key).not.toMatch(/<script|on\w+=|href=/i);
    }
  });

  it('covers every category used by the shirt and T-shirt templates', () => {
    const categories = new Set(PLATFORM_LIBRARY.map((s) => s.category));
    for (const c of Object.keys(ArtifactCategories))
      expect(categories.has(c as never), c).toBe(true);
  });

  it('never claims manufacturing facts (physical properties stay missing)', () => {
    for (const spec of PLATFORM_LIBRARY)
      for (const pv of Object.values(spec.physical ?? {}))
        expect(pv.status, spec.key).toBe('missing');
  });

  it('lace goes on sleeve hems but not on collars', () => {
    const lace = PLATFORM_LIBRARY.find((s) => s.key === 'lace.scalloped_border')!;
    const def = validateArtifactRevision(lace.definition, {}).definition!;
    expect(
      checkCompatibility(def, 'G2', { componentType: 'sleeve', region: 'hem' }).compatible,
    ).toBe(true);
    expect(checkCompatibility(def, 'G2', { componentType: 'collar' }).compatible).toBe(false);
  });
});
