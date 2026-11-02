import type { GarmentDesignState } from '@ai-designer/garment-model';

import {
  AnalysisCategories,
  AnalysisComponentTypes,
  type AnalysisComponent,
} from './analysis-schema.js';

/**
 * Prompts for the analyzer and the tech pack (ADR-056). They ask for structure, not pictures, and
 * always say that measurements are estimates: nothing the model returns is treated as confirmed.
 */

export const ANALYST_SYSTEM = [
  'You are a garment technologist helping people who are NOT fashion professionals turn images',
  'into a structured garment design. You decompose garments into their construction components',
  '(body panels, sleeves, cuffs, collar, collar stand, placket, pockets, yoke, waistband, …).',
  'Be honest: estimate measurements in millimetres only when the images allow a reasonable guess,',
  'never claim manufacturing accuracy, and list what is missing instead of inventing it.',
].join(' ');

export interface AnalysisInputDescription {
  index: number;
  /** Role chosen by the user, or `auto` to let the model decide. */
  role: string;
  fileName?: string | null;
}

export function decompositionPrompt(input: {
  inputs: readonly AnalysisInputDescription[];
  notes?: string | null;
  garmentHint?: string | null;
  audience?: string | null;
}): string {
  const lines = [
    'Analyse ALL images together as ONE garment project (they may be a sketch, a reference photo of',
    'an existing garment, pattern pieces and fabric swatches of the same design).',
    '',
    'Images:',
    ...input.inputs.map(
      (i) =>
        `- Image ${i.index + 1}: ${i.role === 'auto' ? 'role not given — decide (sketch, reference, pattern, fabric)' : i.role}${i.fileName ? ` (file "${i.fileName}")` : ''}`,
    ),
    '',
    input.garmentHint ? `The user says the garment is: ${input.garmentHint}.` : '',
    input.audience ? `Intended for: ${input.audience}.` : '',
    input.notes ? `User notes: ${input.notes}` : '',
    '',
    'Tasks:',
    `1. Classify the garment (category one of: ${AnalysisCategories.join(', ')}).`,
    `2. List every visible construction component (componentType one of: ${AnalysisComponentTypes.join(', ')}).`,
    '   Include a garment_body root (key "body"); give left/right parts separately with side;',
    '   parentKey links a part to its parent (cuff → its sleeve, collar_stand → collar, everything',
    '   else → "body"). Use a unique snake_case key per component.',
    '3. For each component give attributes using these names where they apply: sleeve_type',
    '   (set_in, raglan, drop_shoulder, dolman, sleeveless), cuff_type (barrel_single_button,',
    '   barrel_double_button, french, rib, plain, hemmed), collar_type (spread, point, button_down,',
    '   mandarin, camp, band, peter_pan, notched_lapel, shawl, none), neckline_type (crew, v_neck,',
    '   scoop, henley, boat), placket_type (standard, concealed, covered, half, none), closure_type',
    '   (button, snap, zip, none), button_count (number), pocket_type (patch, patch_with_flap, welt,',
    '   inseam, none), hem_type (shirt_tail, straight, single_fold, double_fold, coverstitch, rolled).',
    '4. Estimate measurements in millimetres for an adult medium unless the images show otherwise',
    '   (body_length, chest_width = half chest across, shoulder_width, sleeve_length, cuff_width,',
    '   collar_height, placket_width, waist_width, hip_width, inseam, leg_opening, skirt_length,',
    '   waistband_height). Mark measurementSource "pattern" only when read from an uploaded pattern.',
    '5. RECONSTRUCT, DO NOT CROP: we rebuild the garment as editable vector parts that together',
    '   look like the original. For every component give:',
    '   - region: its bounding box on the clearest sketch/reference image, normalized 0–1',
    '     (x, y = top-left; imageIndex = that image);',
    '   - outline: 6–40 points tracing the visible outer edge of that component, clockwise,',
    '     normalized to its OWN region box (0,0 = box top-left, 1,1 = box bottom-right); add',
    '     "smooth": true on points where the edge curves (collar points, armholes, hems);',
    '   - view: "front" or "back" (which side of the garment the image shows);',
    '   - details: inner lines in the same box coordinates: stitch lines, fold lines, darts,',
    '     button positions ("button" with one point each), buttonholes.',
    '   Parts overlap like real garments (sleeves meet the body at the armhole, the collar sits on',
    '   the neckline). Trace what you see; keep proportions; do not invent hidden parts.',
    '6. For every fabric image, describe the fabric (key like "fabric_a", hex color, pattern,',
    '   texture, likely material only if reasonably identifiable) and suggest fabricKey per',
    '   component when obvious (main body fabric, contrast collar…).',
    '7. For uploaded pattern images, list each pattern piece with an outline normalized to its own',
    '   bounding box (0–1, 8–40 points), estimated size in mm if a scale is visible (else null) and',
    '   its markings (grainline, notches, fold, text).',
    '8. missingInformation: what a manufacturer would still need (exact measurements, fabric',
    '   composition, trims, sizes…).',
  ];
  return lines.filter((l) => l !== undefined).join('\n');
}

export const DECOMPOSITION_SHAPE = `{
  "garment": { "category": "woven_shirt", "label": "Men's long-sleeve shirt", "audience": "men", "silhouette": "regular", "description": "…", "confidence": 0.8 },
  "inputs": [{ "index": 0, "role": "sketch", "notes": "front view line drawing" }],
  "components": [
    { "key": "body", "componentType": "garment_body", "name": "Shirt body", "side": "none", "parentKey": null, "description": "…", "attributes": {}, "measurementsMm": { "body_length": 760, "chest_width": 560 }, "measurementSource": "estimated", "region": { "imageIndex": 0, "x": 0.25, "y": 0.08, "width": 0.5, "height": 0.85 }, "outline": [{ "x": 0.3, "y": 0 }, { "x": 0.7, "y": 0 }, { "x": 1, "y": 0.08 }, { "x": 1, "y": 0.3, "smooth": true }, { "x": 1, "y": 1 }, { "x": 0, "y": 1 }, { "x": 0, "y": 0.3, "smooth": true }, { "x": 0, "y": 0.08 }], "view": "front", "details": [{ "kind": "stitch", "points": [{ "x": 0, "y": 0.95 }, { "x": 1, "y": 0.95 }] }], "fabricKey": "fabric_a", "confidence": 0.8 },
    { "key": "left_cuff", "componentType": "cuff", "name": "Left cuff", "side": "left", "parentKey": "left_sleeve", "description": "…", "attributes": { "cuff_type": "barrel" }, "measurementsMm": { "cuff_width": 65 }, "measurementSource": "estimated", "region": null, "fabricKey": null, "confidence": 0.6 }
  ],
  "fabrics": [{ "key": "fabric_a", "imageIndex": 1, "name": "Blue oxford", "color": "#4a6fa5", "pattern": "solid", "texture": "basket weave", "likelyMaterial": "cotton", "weight": "medium", "notes": "" }],
  "patternPieces": [{ "componentKey": "left_cuff", "name": "Cuff", "imageIndex": 2, "outline": [{ "x": 0, "y": 0 }, { "x": 1, "y": 0 }, { "x": 1, "y": 1 }, { "x": 0, "y": 1 }], "widthMm": 250, "heightMm": 130, "cutQuantity": 2, "markings": ["fold line"] }],
  "missingInformation": ["Exact chest measurement"]
}`;

export function componentDetailPrompt(input: {
  garmentLabel: string;
  components: readonly Pick<
    AnalysisComponent,
    'key' | 'name' | 'componentType' | 'description' | 'attributes'
  >[];
}): string {
  return [
    `Garment: ${input.garmentLabel}.`,
    'Look closely at these components in the images and refine each one: a short description, the',
    'construction attributes (same names as before), better millimetre estimates if you can,',
    'construction notes a sewing factory would need (stitching, interfacing, fold, buttonholes…)',
    'and a typical seam allowance. Only these components:',
    ...input.components.map(
      (c) =>
        `- ${c.key}: ${c.name} (${c.componentType}) ${c.description ? `— ${c.description}` : ''} ${Object.keys(c.attributes).length ? JSON.stringify(c.attributes) : ''}`,
    ),
  ].join('\n');
}

export const COMPONENT_DETAIL_SHAPE = `{ "details": [ { "key": "left_cuff", "description": "…", "attributes": { "cuff_type": "barrel" }, "measurementsMm": { "cuff_width": 65 }, "constructionNotes": ["Fuse interfacing to the outer cuff", "Topstitch 1/4 in from the edge"], "seamAllowanceMm": 10 } ] }`;

export function techPackTextPrompt(input: { state: GarmentDesignState; summary: unknown }): string {
  return [
    'Draft the technical documentation for this finalized garment design. Use ONLY the structured',
    'data below (it is the source of truth) and the images for visual context. Do not change the',
    'design. Where information is missing say so instead of inventing values (no invented',
    'measurements, compositions or supplier facts). This is a draft a technologist will review.',
    '',
    'Structured design:',
    JSON.stringify(input.summary),
  ].join('\n');
}

export const TECHPACK_TEXT_SHAPE = `{
  "description": "…",
  "constructionSteps": [{ "title": "Attach yoke", "details": "…", "components": ["Yoke", "Back"] }],
  "stitching": [{ "seam": "Side seams", "stitch": "Flat-felled, 12 SPI", "notes": "" }],
  "finishing": ["Press all seams"],
  "qualityCheckpoints": ["Collar points symmetrical within 2 mm"],
  "careNotes": ["Machine wash 30 °C"]
}`;

/** Presentation presets for the mannequin / model images (ADR-057). */
export interface Presentation {
  model: 'female' | 'male' | 'child' | 'none';
  pose: 'standing_front' | 'three_quarter' | 'walking';
  background: 'studio_white' | 'light_grey' | 'lifestyle';
  view: 'front' | 'back';
}

export const DEFAULT_PRESENTATION: Presentation = {
  model: 'female',
  pose: 'standing_front',
  background: 'studio_white',
  view: 'front',
};

const BACKGROUND = {
  studio_white: 'plain white studio background, soft even light',
  light_grey: 'plain light-grey studio background, soft even light',
  lifestyle:
    'simple, uncluttered lifestyle setting with natural light (the garment stays the focus)',
} as const;
const POSE = {
  standing_front: 'standing straight, facing the camera',
  three_quarter: 'standing in a relaxed three-quarter turn',
  walking: 'mid-stride walking pose',
} as const;
const MODEL = {
  female: 'an adult female model',
  male: 'an adult male model',
  child: 'a child model (age-appropriate, fully clothed, neutral pose)',
  none: 'an invisible / ghost mannequin (no person visible)',
} as const;

/**
 * Image prompts — always anchored to the finalized structured design (the source of truth); the
 * reference images passed with them are the final reconstruction (and the original upload).
 */
export function imagePrompt(
  kind: 'front' | 'back' | 'side' | 'mannequin' | 'model',
  description: string,
  presentation: Presentation = DEFAULT_PRESENTATION,
): string {
  const base = `Garment design (the finalized structured design — reproduce it faithfully: same silhouette, proportions, component placement, colours and details; do not add or remove anything): ${description}\nThe first reference image is the finalized garment drawing; follow it over any other reference.`;
  const facing = presentation.view === 'back' ? 'BACK view (seen from behind)' : 'FRONT view';
  switch (kind) {
    case 'front':
      return `${base}\nCreate a clean, realistic product rendering of the garment, FRONT view, flat on a plain white background, even studio light, no person, no text.`;
    case 'back':
      return `${base}\nCreate a clean, realistic product rendering of the garment, BACK view, flat on a plain white background, even studio light, no person, no text.`;
    case 'side':
      return `${base}\nCreate a clean, realistic product rendering of the garment, SIDE view, on a plain white background, no person, no text.`;
    case 'mannequin':
      return `${base}\nShow the garment worn by a neutral grey dress form / mannequin, ${facing}, full garment visible, ${BACKGROUND[presentation.background]}, no text.`;
    case 'model':
      return `${base}\nShow the garment worn by ${MODEL[presentation.model]}, ${POSE[presentation.pose]}, ${facing}, full garment visible, ${BACKGROUND[presentation.background]}, no text, no logos.`;
  }
}
