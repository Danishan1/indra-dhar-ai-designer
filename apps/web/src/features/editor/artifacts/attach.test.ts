import type { ArtifactRenderInfo } from '@ai-designer/contracts';
import { type GarmentDesignState, templates } from '@ai-designer/garment-model';
import { describe, expect, it } from 'vitest';

import {
  artifactFit,
  type ArtifactSummary,
  bindingViews,
  decodeDrag,
  encodeDrag,
  planAttach,
} from './attach';

const REV1 = '11111111-1111-4111-8111-111111111111';
const REV2 = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';

const lace: ArtifactSummary = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Scalloped lace',
  category: 'lace',
  currentRevisionId: REV1,
  compatibleTargetTypes: ['sleeve', 'hem'],
  geometryCapability: 'G2',
  lifecycleStatus: 'active',
};
const raglan: ArtifactSummary = {
  ...lace,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Raglan sleeve',
  category: 'sleeve',
  currentRevisionId: REV2,
  compatibleTargetTypes: ['sleeve'],
};

const info = (over: Partial<ArtifactRenderInfo>): ArtifactRenderInfo => ({
  artifactRevisionId: REV1,
  artifactId: lace.id,
  name: 'Scalloped lace',
  category: 'lace',
  shapeParams: null,
  previewUrl: null,
  displayId: 'LAC-0001-R001',
  revisionNumber: 1,
  currentRevisionId: REV1,
  currentRevisionNumber: 1,
  lifecycleStatus: 'active',
  compatibleTargetTypes: ['sleeve'],
  allowedPlacementRegions: ['hem', 'edge'],
  preferredPlacementRegions: ['hem'],
  ...over,
});

const shirt = () => templates.create('woven_shirt') as GarmentDesignState;
const sleeveOf = (s: GarmentDesignState) =>
  s.components.find((c) => c.componentType === 'sleeve' && c.side === 'left')!;

describe('artifactFit', () => {
  it('explains why an artifact does or does not fit', () => {
    const s = shirt();
    const sleeve = sleeveOf(s);
    const collar = s.components.find((c) => c.componentType === 'collar')!;
    expect(artifactFit(lace, sleeve)).toEqual({ status: 'compatible', reason: null });
    expect(artifactFit(lace, collar)).toMatchObject({ status: 'incompatible' });
    expect(artifactFit(lace, collar).reason).toContain('not collar');
    expect(artifactFit({ ...lace, geometryCapability: 'G0' }, sleeve).status).toBe('review');
    expect(artifactFit({ ...lace, lifecycleStatus: 'deactivated' }, sleeve).status).toBe(
      'incompatible',
    );
    expect(artifactFit(lace, { ...sleeve, locked: true }).reason).toContain('locked');
    // No declared targets = usable anywhere (e.g. a fabric).
    expect(artifactFit({ ...lace, compatibleTargetTypes: [] }, collar).status).toBe('compatible');
  });
});

describe('planAttach', () => {
  it('attaches trims and pins the current revision', () => {
    const sleeve = sleeveOf(shirt());
    expect(planAttach(lace, sleeve, new Map())).toEqual({
      operation: {
        type: 'attach_artifact',
        componentId: sleeve.componentId,
        artifactRevisionId: REV1,
      },
      label: `Attach Scalloped lace to ${sleeve.displayName}`,
    });
  });

  it('replaces the binding of the same component category explicitly', () => {
    const sleeve = {
      ...sleeveOf(shirt()),
      artifactBindings: [
        { bindingId: 'bnd_aaaaaaaa', artifactId: 'x', artifactRevisionId: OTHER, role: 'sleeve' },
      ],
    };
    const plan = planAttach(raglan, sleeve, new Map([[OTHER, { category: 'sleeve' as const }]]));
    expect(plan?.operation).toEqual({
      type: 'replace_artifact',
      componentId: sleeve.componentId,
      bindingId: 'bnd_aaaaaaaa',
      artifactRevisionId: REV2,
    });
    // Same revision already pinned: nothing to do.
    expect(planAttach({ ...raglan, currentRevisionId: OTHER }, sleeve, new Map())).toBeNull();
  });
});

describe('bindingViews', () => {
  it('shows pins, newer revisions and unavailable references', () => {
    const s = shirt();
    const sleeve = {
      ...sleeveOf(s),
      artifactBindings: [
        { bindingId: 'bnd_aaaaaaaa', artifactId: lace.id, artifactRevisionId: REV1, role: 'lace' },
        { bindingId: 'bnd_bbbbbbbb', artifactId: 'gone', artifactRevisionId: OTHER, role: 'lace' },
      ],
    };
    const infos = new Map([[REV1, info({ currentRevisionId: REV2, currentRevisionNumber: 2 })]]);
    const [pinned, gone] = bindingViews(s, sleeve, infos, true);
    expect(pinned).toMatchObject({
      unavailable: false,
      deactivated: false,
      update: { revisionId: REV2, revisionNumber: 2 },
    });
    expect(gone).toMatchObject({ unavailable: true, info: null, update: null });
    // While loading, nothing is reported unavailable.
    expect(bindingViews(s, sleeve, new Map(), false)[1]?.unavailable).toBe(false);
  });
});

describe('drag payload', () => {
  it('round-trips and rejects junk', () => {
    expect(decodeDrag(encodeDrag(lace))).toEqual(lace);
    expect(decodeDrag('nope')).toBeNull();
    expect(decodeDrag('{"id":1}')).toBeNull();
  });
});
