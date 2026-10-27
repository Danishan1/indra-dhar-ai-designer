import type { ConstraintSet, DimensionRange } from '../engine.js';
import { approximatePlacement, trimOnKnit } from '../rules/placement.js';
import {
  collarOrHood,
  cuffRequiresSleeve,
  requiredComponents,
  sidedPairs,
} from '../rules/structure.js';
import {
  conflictingOptions,
  definingProperties,
  dimensionRanges,
  unconfirmedCritical,
} from '../rules/values.js';

const r = (typical: [number, number], limits: [number, number]): DimensionRange => ({
  typical,
  limits,
});

/** Dimension ranges in mm per garment type (adult sizes; chest = half chest across). */
const SHIRT = {
  'dimension.body_length': r([650, 900], [400, 1300]),
  'dimension.chest_width': r([450, 680], [300, 1000]),
  'dimension.shoulder_width': r([380, 540], [250, 800]),
  'dimension.sleeve_length': r([150, 700], [50, 950]),
  'dimension.cuff_width': r([45, 90], [20, 200]),
  'dimension.collar_height': r([25, 60], [10, 150]),
  'dimension.neckline_width': r([140, 230], [90, 400]),
  'dimension.placket_width': r([20, 45], [8, 100]),
  'dimension.hem_depth': r([5, 30], [2, 100]),
  'dimension.seam_allowance': r([5, 20], [2, 40]),
} as const;

const TSHIRT = {
  ...SHIRT,
  'dimension.body_length': r([600, 820], [400, 1300]),
  'dimension.sleeve_length': r([120, 680], [50, 950]),
  'dimension.cuff_width': r([15, 60], [5, 200]),
  'dimension.neckline_width': r([150, 260], [90, 400]),
} as const;

/**
 * `design-structure@1.0.0` (I20): the platform constraint set for every garment type. Versions are
 * permanent — a behaviour change means a new version, so old runs stay repeatable (CST-004).
 */
export const DESIGN_STRUCTURE_V1: ConstraintSet = Object.freeze({
  key: 'design-structure',
  version: '1.0.0',
  label: 'Design structure',
  garmentTypes: '*',
  rules: Object.freeze([
    requiredComponents,
    cuffRequiresSleeve,
    sidedPairs,
    collarOrHood,
    conflictingOptions,
    dimensionRanges,
    definingProperties,
    trimOnKnit,
    approximatePlacement,
    unconfirmedCritical,
  ]),
  ranges: Object.freeze({ shirt: SHIRT, tshirt: TSHIRT }),
});

/** Every constraint set the platform knows, newest last per key. */
export const CONSTRAINT_SETS: readonly ConstraintSet[] = Object.freeze([DESIGN_STRUCTURE_V1]);

/** The current set for a garment type (all types share `design-structure` today). */
export function constraintSetFor(garmentType: string): ConstraintSet {
  return (
    [...CONSTRAINT_SETS]
      .reverse()
      .find((s) => s.garmentTypes === '*' || s.garmentTypes.includes(garmentType)) ??
    DESIGN_STRUCTURE_V1
  );
}

/** Looks a set up by `key@version` (old runs are re-run against the exact version they used). */
export function constraintSetByRef(ref: string): ConstraintSet | null {
  return CONSTRAINT_SETS.find((s) => `${s.key}@${s.version}` === ref) ?? null;
}
