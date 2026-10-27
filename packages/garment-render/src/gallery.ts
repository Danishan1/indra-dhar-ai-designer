/**
 * Representative variants per template (golden tests and the dev gallery `/dev/garment-gallery`).
 * Values are set as template proposals — the gallery is a preview, never design data.
 */
import {
  type GarmentDesignState,
  proposedFromTemplate,
  sequentialRandomBytes,
  templates,
} from '@ai-designer/garment-model';

import type { ArtifactRenderInfo } from './types.js';

const shirt = () => templates.create('woven_shirt', { randomBytes: sequentialRandomBytes() });
const tee = () => templates.create('knit_tshirt', { randomBytes: sequentialRandomBytes() });

export type Values = Record<string, Record<string, string | number | null>>;
/** Sets property values on components found by type (or `type:side`). Mutates and returns the state. */
export function withValues(state: GarmentDesignState, values: Values): GarmentDesignState {
  for (const [sel, props] of Object.entries(values)) {
    const [type, side] = sel.split(':');
    for (const c of state.components.filter(
      (x) => x.componentType === type && (!side || x.side === side),
    ))
      for (const [k, v] of Object.entries(props))
        c.properties[k] =
          v === null
            ? { ...c.properties[k]!, value: null, status: 'missing' }
            : proposedFromTemplate(
                v,
                typeof v === 'number' && k.startsWith('dimension.') ? 'mm' : null,
              );
  }
  return state;
}

export const galleryLace: ArtifactRenderInfo = {
  name: 'Scallop lace',
  category: 'lace',
  shapeParams: { kind: 'border', params: { widthMm: 20 } },
};
export function withTrim(state: GarmentDesignState, targetType: string, region: string | null) {
  const target = state.components.find((c) => c.componentType === targetType)!;
  state.relationships.push({
    relationshipId: `rel_${targetType.replaceAll('_', '')}aaaa`,
    type: 'decorative_trim_applied_to',
    source: { entityType: 'artifact_revision', entityId: 'rev-lace' },
    target: { entityType: 'design_component', entityId: target.componentId },
    placement: {
      region,
      anchor: null,
      coordinateSpace: 'design_2d',
      translation: null,
      rotationDeg: null,
      scale: null,
      orientation: 'follow_boundary',
      offset: null,
      geometryRevisionId: null,
      calibrationRef: null,
      approximate: region === null,
      confidence: null,
    },
    constraints: [],
    status: 'confirmed',
    provenanceRefs: [],
  });
  return state;
}
/** Resolver for the gallery's lace trim. */
export const galleryArtifact = (id: string) => (id === 'rev-lace' ? galleryLace : null);

export const GALLERY_VARIANTS: Record<string, () => GarmentDesignState> = {
  'woven_shirt-default': shirt,
  'woven_shirt-short-mandarin-flap': () =>
    withValues(shirt(), {
      sleeve: { 'dimension.sleeve_length': 260 },
      collar: { 'construction.collar_type': 'mandarin' },
      pocket: {
        'construction.pocket_type': 'patch_with_flap',
        'placement.pocket_position': 'right_chest',
      },
      placket: { 'construction.placket_type': 'concealed' },
      hem: { 'construction.hem_type': 'straight' },
      garment_body: { 'appearance.color': '#335577', 'appearance.pattern': 'stripe' },
    }),
  'woven_shirt-button-down-raglan-lace': () =>
    withTrim(
      withValues(shirt(), {
        sleeve: { 'construction.sleeve_type': 'raglan' },
        collar: { 'construction.collar_type': 'button_down' },
        cuff: { 'construction.cuff_type': 'french' },
        garment_body: { 'appearance.silhouette': 'oversized', 'dimension.body_length': 820 },
      }),
      'hem',
      'hem',
    ),
  'knit_tshirt-default': tee,
  'knit_tshirt-vneck-raglan': () =>
    withValues(tee(), {
      neckline: { 'construction.neckline_type': 'v_neck' },
      sleeve: { 'construction.sleeve_type': 'raglan' },
    }),
  'knit_tshirt-sleeveless-scoop': () =>
    withValues(tee(), {
      neckline: { 'construction.neckline_type': 'scoop' },
      sleeve: { 'construction.sleeve_type': 'sleeveless' },
    }),
  'knit_tshirt-henley-drop-shoulder-long': () =>
    withValues(tee(), {
      neckline: { 'construction.neckline_type': 'henley' },
      sleeve: { 'construction.sleeve_type': 'drop_shoulder', 'dimension.sleeve_length': 600 },
      garment_body: { 'appearance.color': '#a33b3b', 'appearance.silhouette': 'boxy' },
    }),
  'knit_tshirt-boat-dolman-check': () =>
    withValues(tee(), {
      neckline: { 'construction.neckline_type': 'boat' },
      sleeve: { 'construction.sleeve_type': 'dolman' },
      garment_body: { 'appearance.pattern': 'check' },
    }),
};
