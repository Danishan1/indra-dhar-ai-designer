/**
 * Which properties change the 2D flat, per component type (I17 marks them "visual"; the README table
 * is generated from the same facts). Everything not listed does not affect the drawing.
 */
export const VISUAL_PROPERTIES: Readonly<
  Record<string, readonly { key: string; effect: string }[]>
> = Object.freeze({
  garment_body: [
    { key: 'dimension.chest_width', effect: 'Body width at the underarm' },
    { key: 'dimension.shoulder_width', effect: 'Shoulder points' },
    { key: 'dimension.body_length', effect: 'HPS to hem at centre' },
    { key: 'appearance.silhouette', effect: 'Hem width (slim … oversized)' },
    { key: 'appearance.color', effect: 'Fill (inherited by parts without a colour)' },
    { key: 'appearance.pattern', effect: 'Stripe / check fill' },
    { key: 'material.fabric_ref', effect: 'Fabric texture fill (via resolver)' },
  ],
  front_body_panel: [
    { key: 'appearance.color', effect: 'Front fill' },
    { key: 'appearance.pattern', effect: 'Front stripe / check' },
    { key: 'material.fabric_ref', effect: 'Front texture' },
  ],
  back_body_panel: [
    { key: 'appearance.color', effect: 'Back fill' },
    { key: 'appearance.pattern', effect: 'Back stripe / check' },
    { key: 'material.fabric_ref', effect: 'Back texture' },
  ],
  sleeve: [
    {
      key: 'construction.sleeve_type',
      effect: 'Set-in, raglan, drop shoulder, dolman, sleeveless (also the armhole)',
    },
    { key: 'dimension.sleeve_length', effect: 'Sleeve length and hang angle' },
    { key: 'appearance.color', effect: 'Fill' },
  ],
  cuff: [
    { key: 'construction.cuff_type', effect: 'Buttons, French fold, rib lines, stitching' },
    { key: 'dimension.cuff_width', effect: 'Cuff depth' },
    { key: 'appearance.color', effect: 'Fill' },
  ],
  collar: [
    {
      key: 'construction.collar_type',
      effect: 'Spread, point, button-down, camp leaves; mandarin/band stand; none',
    },
    { key: 'dimension.collar_height', effect: 'Stand and leaf size' },
    { key: 'appearance.color', effect: 'Fill' },
  ],
  neckline: [
    { key: 'construction.neckline_type', effect: 'Crew, V, scoop, henley (placket), boat' },
    { key: 'dimension.neckline_width', effect: 'Neck opening width' },
    { key: 'appearance.color', effect: 'Rib fill' },
  ],
  placket: [
    { key: 'construction.placket_type', effect: 'Standard, concealed, covered, half, none' },
    { key: 'construction.closure_type', effect: 'Buttons, snaps, zip' },
    { key: 'construction.button_count', effect: 'Number of visible buttons/snaps' },
    { key: 'dimension.placket_width', effect: 'Placket width' },
    { key: 'appearance.color', effect: 'Fill' },
  ],
  pocket: [
    {
      key: 'construction.pocket_type',
      effect: 'Patch, patch with flap, welt, inseam (hidden), none',
    },
    { key: 'placement.pocket_position', effect: 'Chest / lower, left / right / centre' },
    { key: 'appearance.color', effect: 'Fill' },
  ],
  hem: [
    { key: 'construction.hem_type', effect: 'Shirt-tail curve or straight edge; topstitch lines' },
    { key: 'dimension.hem_depth', effect: 'Hem band and stitch position' },
    { key: 'appearance.color', effect: 'Fill' },
  ],
  yoke: [{ key: 'appearance.color', effect: 'Fill (back view)' }],
});
