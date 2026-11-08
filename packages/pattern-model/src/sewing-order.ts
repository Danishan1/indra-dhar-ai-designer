import type { DesignComponent, PatternPiece, PatternSpec } from '@ai-designer/garment-model';

import { edgeAllowance } from './cut.js';

/**
 * Deterministic construction order from the pattern parts (ADR-060). Standard sequence for the
 * garment family — darts, shoulders, neck finish, sleeves, side seams, cuffs, waist, closure, hem —
 * filtered to the parts this pattern has. It is a proposal for the tech pack (status `proposed`),
 * also given to the AI as context for its sewing notes.
 */

export interface SewingStep {
  step: number;
  title: string;
  detail: string;
}

const PART = 'part:';

export function sewingOrder(input: {
  patternSpec: PatternSpec;
  components: readonly Pick<DesignComponent, 'tags'>[];
  patternPieces: readonly PatternPiece[];
}): SewingStep[] {
  const { patternSpec: spec } = input;
  const parts = new Set(
    input.components.flatMap((c) =>
      c.tags.filter((t) => t.startsWith(PART)).map((t) => t.slice(PART.length)),
    ),
  );
  const has = (k: string) => parts.has(k);
  const pieces = input.patternPieces;
  const darts = pieces.some((p) => p.markings?.some((m) => m.kind === 'dart'));
  const gathers = pieces.some((p) => p.markings?.some((m) => m.kind === 'gather'));
  const sa = spec.seamAllowanceMm;
  const hemPiece = pieces.find((p) => p.allowances?.hem !== undefined);
  const hem = hemPiece ? edgeAllowance(hemPiece, 'hem') : spec.hemAllowanceMm;
  const closure = spec.style.closure;
  const steps: Omit<SewingStep, 'step'>[] = [];
  const add = (title: string, detail: string) => steps.push({ title, detail });

  add(
    'Cut and mark',
    `Cut all pieces per the cutting layout with the grain along the length; transfer notches${darts ? ', dart legs' : ''} and placement marks. Seam allowance ${sa} mm unless noted.`,
  );
  if (
    pieces.some((p) => p.fabricRole === 'interfacing') ||
    has('collar') ||
    has('cuffs') ||
    has('waistband')
  )
    add('Interface', 'Fuse interfacing to collar, stand, cuffs, waistband and facings as marked.');
  if (darts)
    add(
      'Sew darts',
      'Stitch darts from the wide end to the point; press bust darts down, waist darts towards the centre.',
    );
  if (gathers)
    add(
      'Gather',
      'Run two rows of gathering stitches inside the seam allowance between the gather marks.',
    );

  const top = spec.family === 'top' || spec.family === 'dress';
  if (top) {
    if (has('yoke'))
      add(
        'Attach yoke',
        'Sew the back to the yoke (burrito method if lined); press seam towards the yoke.',
      );
    add(
      'Join shoulders',
      'Sew front to back at the shoulder seams, matching notches; neaten and press towards the back.',
    );
    if (closure === 'front_buttons')
      add(
        'Finish front edges',
        'Fold and press the front facings/plackets along the fold line; edgestitch.',
      );
    if (has('collar_stand') || has('collar'))
      add(
        'Make and attach collar',
        has('collar_stand')
          ? 'Sew collar, turn and topstitch; sandwich between stand pieces; attach the stand to the neckline matching CB and shoulder notches.'
          : 'Sew collar pieces, turn and press; attach to the neckline matching CB and shoulder notches; finish with the facing.',
      );
    else if (has('neckband'))
      add(
        'Attach neckband',
        'Join the band into a loop, fold in half and stretch-sew to the neckline, quartered to CF, CB and shoulders.',
      );
    else if (has('neck_facing'))
      add(
        'Face the neckline',
        'Join the facings at the shoulders, neaten the outer edge, sew to the neckline, understitch and turn.',
      );
    if (has('sleeves'))
      add(
        'Set in sleeves',
        'Ease the sleeve cap between the notches and sew into the armhole, matching the shoulder point and underarm.',
      );
    add(
      'Sew side seams',
      has('sleeves')
        ? 'Sew from the sleeve hem through the underarm to the hem in one pass; neaten and press towards the back.'
        : 'Sew the side seams, matching notches; neaten and press.',
    );
    if (has('pocket_bags') && spec.family === 'dress')
      add(
        'Pockets',
        'Attach pocket bags to the side seams before closing them; stitch around the bags.',
      );
    if (has('armhole_finish'))
      add(
        'Bind armholes',
        'Apply the bias binding to the armholes, turn to the inside and topstitch.',
      );
    if (has('cuffs'))
      add(
        'Attach cuffs',
        'Finish the sleeve plackets, pleat the sleeve hem to the cuff width and attach the cuffs.',
      );
  }

  if (spec.family === 'dress' && has('skirt')) {
    add(
      'Join skirt panels',
      'Sew the skirt side seams' + (gathers ? ', gather the waist' : '') + '.',
    );
    add(
      'Join bodice and skirt',
      'Sew the skirt to the bodice at the waist matching side seams and CF/CB; press up.',
    );
  }
  if (spec.family === 'skirt') {
    add(
      'Sew side seams',
      'Sew the skirt side seams, leaving the zip opening; neaten and press open.',
    );
    if (has('pocket_bags'))
      add('Pockets', 'Attach pocket bags to the side seams and stitch around them.');
  }
  if (spec.family === 'trousers') {
    if (has('pocket_bags')) add('Pockets', 'Make the side-seam pockets on the front legs.');
    if (has('fly'))
      add('Fly front', 'Sew the fly facing and shield; insert the zip and topstitch the fly.');
    add(
      'Sew outseams and inseams',
      'Sew each leg at the outseam, then the inseam; neaten and press.',
    );
    add(
      'Sew crotch',
      'Turn one leg inside the other and sew the crotch seam from the back waist to the fly; reinforce the curve.',
    );
  }
  if (closure === 'back_zip' || closure === 'side_zip')
    add(
      'Insert zip',
      `Insert the ${closure === 'back_zip' ? 'centre back' : 'side'} zip; finish the seam below it.`,
    );
  if (has('waistband'))
    add(
      'Attach waistband',
      'Sew the waistband to the waist matching notches, fold, close the ends and stitch in the ditch.',
    );
  add(
    'Hem',
    `Turn up the hem by ${hem} mm (press ${Math.min(10, hem)} mm under first) and stitch.`,
  );
  if (
    closure === 'front_buttons' ||
    pieces.some((p) => p.markings?.some((m) => m.kind === 'buttonhole'))
  )
    add(
      'Buttonholes and buttons',
      'Mark from the pattern, sew buttonholes, then sew on buttons to match.',
    );
  add('Final press and inspect', 'Trim threads, press, check measurements against the spec.');
  return steps.map((s, i) => ({ step: i + 1, ...s }));
}
