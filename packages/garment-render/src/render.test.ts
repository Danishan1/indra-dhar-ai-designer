import { proposedFromTemplate, sequentialRandomBytes, templates } from '@ai-designer/garment-model';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { GALLERY_VARIANTS, galleryArtifact, withTrim, withValues } from './gallery.js';
import { boundsOf } from './geometry.js';
import { layoutViews } from './layout.js';
import { createRenderer, geometryCapability, renderGarment } from './scene.js';
import { componentPreviewSvg, pathDataBounds, sceneToSvg } from './svg-string.js';
import { motifCount } from './trims.js';
import type { Scene } from './types.js';

const shirt = () => templates.create('woven_shirt', { randomBytes: sequentialRandomBytes() });
const tee = () => templates.create('knit_tshirt', { randomBytes: sequentialRandomBytes() });

const elementsOf = (scene: Scene) => [...scene.views.front.elements, ...scene.views.back.elements];

describe('golden technical flats', () => {
  it.each(Object.keys(GALLERY_VARIANTS))('%s', async (name) => {
    const svg = sceneToSvg(
      renderGarment(GALLERY_VARIANTS[name]!(), { artifact: galleryArtifact }),
      {
        background: '#ffffff',
      },
    );
    await expect(svg).toMatchFileSnapshot(`./__snapshots__/${name}.svg`);
  });
});

describe('garment renderer', () => {
  it('is deterministic: same state ⇒ byte-identical SVG (AC3)', () => {
    const a = sceneToSvg(renderGarment(shirt()));
    const b = sceneToSvg(createRenderer().render(shirt()));
    expect(a).toBe(b);
    expect(a).not.toMatch(/NaN|undefined|<script|on[a-z]+=/i);
  });

  it('every element resolves to a canonical component (AC1)', () => {
    for (const make of Object.values(GALLERY_VARIANTS)) {
      const state = make();
      const ids = new Set(state.components.map((c) => c.componentId));
      const scene = renderGarment(state, { artifact: galleryArtifact });
      const els = elementsOf(scene);
      expect(els.length).toBeGreaterThan(10);
      for (const e of els) expect(ids.has(e.componentId!)).toBe(true);
      expect(new Set(els.map((e) => e.id)).size).toBe(els.length);
    }
  });

  it('declares G2 and flags parameters drawn from defaults (AC4)', () => {
    const scene = renderGarment(shirt());
    expect(scene.capability).toBe('G2');
    expect(scene.coordinateSpace).toBe('design_2d');
    const sleeve = shirt().components.find((c) => c.componentType === 'sleeve')!;
    expect(scene.components[sleeve.componentId]!.placeholders).toEqual(['dimension.sleeve_length']);
    expect(
      scene.warnings.some(
        (w) => w.code === 'PLACEHOLDER_GEOMETRY' && w.componentId === sleeve.componentId,
      ),
    ).toBe(true);
    // With a value, it is no longer a placeholder.
    const set = renderGarment(withValues(shirt(), { sleeve: { 'dimension.sleeve_length': 600 } }));
    expect(set.components[sleeve.componentId]!.placeholders).toEqual([]);
    expect(geometryCapability({ garmentCategory: 'woven_shirt' })).toBe('G2');
    expect(geometryCapability({ garmentCategory: null })).toBe('G0');
  });

  it('changing the sleeve length redraws the sleeve deterministically and nothing else (AC2)', () => {
    const r = createRenderer();
    const before = r.render(shirt());
    const after = r.render(withValues(shirt(), { sleeve: { 'dimension.sleeve_length': 400 } }));
    expect(r.stats.misses).toBeGreaterThan(0);
    const changed = elementsOf(after)
      .filter((e) => elementsOf(before).find((b) => b.id === e.id)?.d !== e.d)
      .map((e) => after.components[e.componentId!]!.componentType);
    expect(new Set(changed)).toEqual(new Set(['sleeve', 'cuff']));
    // Units: 40 cm draws like 400 mm.
    const cm = shirt();
    for (const c of cm.components.filter((x) => x.componentType === 'sleeve'))
      c.properties['dimension.sleeve_length'] = proposedFromTemplate(40, 'cm');
    expect(sceneToSvg(renderGarment(cm))).toBe(sceneToSvg(after));
  });

  it('back view is drawn from its own geometry, never mirrored; unknown categories are not guessed (AC5)', () => {
    const scene = renderGarment(shirt());
    const types = (view: 'front' | 'back') =>
      new Set(
        scene.views[view].elements.map((e) => scene.components[e.componentId!]!.componentType),
      );
    expect(types('front').has('placket')).toBe(true);
    expect(types('back').has('placket')).toBe(false);
    expect(types('back').has('pocket')).toBe(false);
    expect(scene.views.back.available).toBe(true);
    const unknown = renderGarment({ ...shirt(), garmentCategory: 'evening_gown' });
    expect(unknown.views.back).toMatchObject({ available: false, reason: 'UNSUPPORTED_CATEGORY' });
    expect(unknown.views.front.elements).toEqual([]);
    expect(unknown.capability).toBe('G0');
  });

  it('lace follows the hem edge; without an edge it is a labelled approximation (AC7)', () => {
    const onHem = renderGarment(withTrim(shirt(), 'hem', 'hem'), { artifact: galleryArtifact });
    const trim = onHem.views.front.elements.find((e) => e.role === 'trim')!;
    expect(trim.label).toBe('Scallop lace on Body hem');
    expect(trim.layer).toBe('trims');
    expect(motifCount(200, 20)).toBe(10);
    expect(motifCount(400, 20)).toBe(20);
    expect(motifCount(5, 20)).toBe(1);
    const scallops = (trim.d.match(/Q/g) ?? []).length;
    expect(scallops).toBeGreaterThan(20);

    const onPanel = renderGarment(withTrim(shirt(), 'front_body_panel', 'yoke'), {
      artifact: galleryArtifact,
    });
    const approx = onPanel.views.front.elements.find((e) => e.role === 'approximate')!;
    expect(approx.text?.value).toBe('approximate');
    expect(onPanel.warnings.some((w) => w.code === 'APPROXIMATE_TRIM')).toBe(true);
    const unknown = renderGarment(withTrim(shirt(), 'hem', 'hem'), { artifact: () => null });
    expect(unknown.warnings.some((w) => w.code === 'UNKNOWN_ARTIFACT')).toBe(true);
  });

  it('lists unsupported components instead of guessing, and hides hidden ones', () => {
    const s = shirt();
    const body = s.components[0]!;
    s.components.push({
      ...structuredClone(s.components.find((c) => c.componentType === 'yoke') ?? body),
      componentId: 'cmp_hood00000001',
      componentType: 'hood',
      displayName: 'Hood',
      parentComponentId: body.componentId,
    });
    const sleeve = s.components.find((c) => c.componentType === 'sleeve')!;
    sleeve.visible = false;
    const scene = renderGarment(s);
    expect(scene.components.cmp_hood00000001!.supported).toBe(false);
    expect(scene.warnings.some((w) => w.code === 'UNSUPPORTED_COMPONENT')).toBe(true);
    expect(scene.views.front.elements.some((e) => e.componentId === sleeve.componentId)).toBe(
      false,
    );
    expect(
      renderGarment(s, { includeHidden: true }).views.front.elements.some(
        (e) => e.componentId === sleeve.componentId,
      ),
    ).toBe(true);
  });

  it('textures only accept safe URLs and labels are escaped', () => {
    const s = withValues(shirt(), {});
    s.components[0]!.displayName = 'Body <b>&"';
    s.components[0]!.properties['material.fabric_ref'] = proposedFromTemplate({
      entityType: 'artifact_revision',
      entityId: 'rev-fabric',
      revisionId: null,
    });
    const svg = (href: string) =>
      sceneToSvg(renderGarment(s, { fabric: () => ({ href, sizeMm: 40 }) }));
    expect(svg('https://cdn.example/fabric.jpg')).toContain(
      'href="https://cdn.example/fabric.jpg"',
    );
    expect(svg('javascript:alert(1)')).not.toContain('javascript:');
    expect(svg('https://x')).toContain('Body &lt;b&gt;&amp;&quot;');
  });

  it('split layout places back to the right of front', () => {
    const scene = renderGarment(shirt());
    const { placements, bounds } = layoutViews(scene, 'split');
    expect(placements.map((p) => p.view)).toEqual(['front', 'back']);
    expect(placements[1]!.dx).toBeGreaterThan(0);
    expect(bounds.width).toBeGreaterThan(scene.views.front.bounds.width * 2);
    expect(layoutViews(scene, 'back').placements).toEqual([{ view: 'back', dx: 0 }]);
  });

  it('property: every enum combination renders finite geometry inside the view bounds', () => {
    const pick = <T>(xs: readonly T[]) => fc.constantFrom(...xs);
    fc.assert(
      fc.property(
        fc.record({
          shirt: fc.boolean(),
          sleeve: pick(['set_in', 'raglan', 'drop_shoulder', 'dolman', 'sleeveless', 'bishop']),
          length: fc.integer({ min: 0, max: 2000 }),
          collar: pick(['spread', 'point', 'button_down', 'mandarin', 'camp', 'band', 'none']),
          neck: pick(['crew', 'v_neck', 'scoop', 'henley', 'boat']),
          cuff: pick([
            'barrel_single_button',
            'barrel_double_button',
            'french',
            'rib',
            'plain',
            'hemmed',
          ]),
          hem: pick([
            'shirt_tail',
            'straight',
            'single_fold',
            'double_fold',
            'coverstitch',
            'rolled',
            'raw_edge',
          ]),
          placket: pick(['standard', 'concealed', 'covered', 'half', 'none']),
          closure: pick(['button', 'snap', 'zip', 'none']),
          pocket: pick(['patch', 'patch_with_flap', 'welt', 'inseam', 'none']),
          position: pick([
            'left_chest',
            'right_chest',
            'center_chest',
            'lower_left',
            'lower_right',
          ]),
          silhouette: pick(['slim', 'regular', 'relaxed', 'oversized', 'boxy']),
          chest: fc.integer({ min: 0, max: 3000 }),
          body: fc.integer({ min: 0, max: 3000 }),
        }),
        (v) => {
          const state = withValues(v.shirt ? shirt() : tee(), {
            sleeve: { 'construction.sleeve_type': v.sleeve, 'dimension.sleeve_length': v.length },
            collar: { 'construction.collar_type': v.collar },
            neckline: { 'construction.neckline_type': v.neck },
            cuff: { 'construction.cuff_type': v.cuff },
            hem: { 'construction.hem_type': v.hem },
            placket: {
              'construction.placket_type': v.placket,
              'construction.closure_type': v.closure,
            },
            pocket: {
              'construction.pocket_type': v.pocket,
              'placement.pocket_position': v.position,
            },
            garment_body: {
              'appearance.silhouette': v.silhouette,
              'dimension.chest_width': v.chest,
              'dimension.body_length': v.body,
            },
          });
          const scene = renderGarment(state);
          for (const view of ['front', 'back'] as const) {
            const b = scene.views[view].bounds;
            for (const e of scene.views[view].elements) {
              const nums = (e.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
              expect(nums.every(Number.isFinite)).toBe(true);
              const pts = [];
              for (let i = 0; i + 1 < nums.length; i += 2)
                pts.push({ x: nums[i]!, y: nums[i + 1]! });
              const eb = boundsOf(pts);
              expect(eb.x).toBeGreaterThanOrEqual(b.x);
              expect(eb.y).toBeGreaterThanOrEqual(b.y);
              expect(eb.x + eb.width).toBeLessThanOrEqual(b.x + b.width + 0.01);
              expect(eb.y + eb.height).toBeLessThanOrEqual(b.y + b.height + 0.01);
            }
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('re-renders a single sleeve change fast (< 16 ms on average, warm cache)', () => {
    const r = createRenderer();
    const states = Array.from({ length: 30 }, (_, i) =>
      withValues(shirt(), { sleeve: { 'dimension.sleeve_length': 300 + i * 10 } }),
    );
    r.render(shirt());
    const t0 = performance.now();
    for (const s of states) r.render(s);
    const avg = (performance.now() - t0) / states.length;
    expect(avg).toBeLessThan(16);
  });
});

describe('placements and previews (I18)', () => {
  it('artwork placements apply scale, rotation and offset reproducibly (GEO-005)', () => {
    const make = (placement: Record<string, unknown>) => {
      const s = shirt();
      const front = s.components.find((c) => c.componentType === 'front_body_panel')!;
      s.relationships.push({
        relationshipId: 'rel_artwork00001',
        type: 'embroidery_placed_on',
        source: { entityType: 'artifact_revision', entityId: 'rev-flower' },
        target: { entityType: 'design_component', entityId: front.componentId },
        placement: {
          region: 'left_chest',
          anchor: null,
          coordinateSpace: 'component_local',
          translation: null,
          rotationDeg: null,
          scale: null,
          orientation: null,
          offset: null,
          geometryRevisionId: null,
          calibrationRef: null,
          approximate: false,
          confidence: null,
          ...placement,
        },
        constraints: [],
        status: 'confirmed',
        provenanceRefs: [],
      } as never);
      const scene = renderGarment(s, {
        artifact: () => ({
          name: 'Flower',
          category: 'embroidery',
          shapeParams: { kind: 'motif', params: { widthMm: 40 } },
        }),
      });
      return scene.views.front.elements.find((e) => e.relationshipId === 'rel_artwork00001')!;
    };
    const plain = make({});
    expect(plain.role).toBe('artwork');
    const bounds = (d: string) => pathDataBounds([d])!;
    expect(bounds(plain.d).width).toBeCloseTo(40, 1);
    const scaled = make({ scale: 2 });
    expect(bounds(scaled.d).width).toBeCloseTo(80, 1);
    const moved = make({ offset: { value: 2, unit: 'cm' } });
    expect(bounds(moved.d).y - bounds(plain.d).y).toBeCloseTo(20, 1);
    const turned = make({ rotationDeg: 45 });
    expect(bounds(turned.d).width).toBeCloseTo(40 * Math.SQRT2, 0);
    expect(make({ rotationDeg: 45 }).d).toBe(turned.d);
    expect(make({ approximate: true }).role).toBe('approximate');
  });

  it('a trim offset moves it away from the component; scale widens it', () => {
    const plain = renderGarment(withTrim(shirt(), 'hem', 'hem'), { artifact: galleryArtifact });
    const trim = (sc: Scene) => sc.views.front.elements.find((e) => e.role === 'trim')!;
    const s2 = withTrim(shirt(), 'hem', 'hem');
    s2.relationships[0]!.placement = {
      ...s2.relationships[0]!.placement!,
      offset: { value: 10, unit: 'mm' },
      scale: 2,
    };
    const shifted = trim(renderGarment(s2, { artifact: galleryArtifact }));
    expect(pathDataBounds([shifted.d])!.y + pathDataBounds([shifted.d])!.height).toBeGreaterThan(
      pathDataBounds([trim(plain).d])!.y + pathDataBounds([trim(plain).d])!.height + 15,
    );
  });

  it('crops a component preview SVG for saved artifacts', () => {
    const s = shirt();
    const collar = s.components.find((c) => c.componentType === 'collar')!;
    const svg = componentPreviewSvg(renderGarment(s), [collar.componentId], {
      background: '#ffffff',
    })!;
    expect(svg).toContain(`data-component-id="${collar.componentId}"`);
    expect(svg).not.toContain('cmp_000000000001"');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(componentPreviewSvg(renderGarment(s), ['cmp_missing00000'])).toBeNull();
  });
});
