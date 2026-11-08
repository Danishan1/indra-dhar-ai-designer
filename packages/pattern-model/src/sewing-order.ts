import {
  type DesignComponent,
  garmentSpec,
  garmentsOf,
  type PatternPiece,
  type PatternSpec,
  patternSpecSchema,
} from '@ai-designer/garment-model';

import { garmentName } from './blocks/resolve.js';
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
  const spec = patternSpecSchema.parse(input.patternSpec);
  if (!spec.garments.length) return garmentOrder({ ...input, patternSpec: spec });
  // Co-ord set: each garment in turn (its own parts and pieces), one cutting and one final step.
  const out: Omit<SewingStep, 'step'>[] = [];
  for (const g of garmentsOf(spec)) {
    const pre = g.key === 'main' ? '' : `${g.key}.`;
    const gs = garmentSpec(spec, g.key);
    const name = garmentName(gs);
    const tags = input.components.map((c) => ({
      tags: c.tags.flatMap((t) => {
        if (!t.startsWith(PART)) return [];
        const k = t.slice(PART.length);
        if (pre) return k.startsWith(pre) ? [PART + k.slice(pre.length)] : [];
        return k.includes('.') ? [] : [t];
      }),
    }));
    const pieces = input.patternPieces.filter((p) => {
      const t = p.draft?.template ?? '';
      return pre ? t.startsWith(pre) : !t.includes('.');
    });
    const steps = garmentOrder({ patternSpec: gs, components: tags, patternPieces: pieces });
    for (const st of steps) {
      if (st.title === 'Cut and mark' || st.title === 'Final press and inspect') {
        if (!out.some((o) => o.title === st.title))
          out.push({ title: st.title, detail: st.detail });
        continue;
      }
      out.push({ title: `${name}: ${st.title}`, detail: st.detail });
    }
  }
  const fin = out.findIndex((o) => o.title === 'Final press and inspect');
  if (fin >= 0) out.push(...out.splice(fin, 1));
  return out.map((s, i) => ({ step: i + 1, ...s }));
}

function garmentOrder(input: {
  patternSpec: PatternSpec;
  components: readonly Pick<DesignComponent, 'tags'>[];
  patternPieces: readonly PatternPiece[];
}): SewingStep[] {
  const { patternSpec: spec } = input;
  const st = spec.style;
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

  const top = ['top', 'dress', 'jacket', 'jumpsuit'].includes(spec.family);
  if (has('placket') && closure === 'front_buttons')
    add(
      'Button placket',
      'Sew the separate placket to the left front, fold to width and edgestitch both sides.',
    );
  if (has('pockets') && (st.pockets === 'patch' || st.pockets === 'kangaroo'))
    add(
      st.pockets === 'kangaroo' ? 'Kangaroo pocket' : 'Chest pockets',
      'Hem the pocket opening, press the edges under and topstitch at the marks.',
    );
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
    if (has('hood'))
      add(
        'Make and attach the hood',
        'Sew the hood centre seam, finish the front edge (hem or lining), then sew to the neckline matching CB and shoulders.',
      );
    if (has('sleeve_plackets'))
      add(
        'Sleeve plackets',
        'Cut the slits, bind the underlap and sew the tower plackets before closing the sleeves.',
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
  if (spec.family === 'dungarees')
    add(
      'Make bibs and straps',
      'Sew the bib pocket to the front bib; sew the bibs to their facings; make the straps and turn them.',
    );
  if (['trousers', 'jumpsuit', 'dungarees'].includes(spec.family)) {
    if (st.backPockets === 'patch')
      add(
        'Back pockets',
        'Hem and press the patch pockets; topstitch to the back legs at the marks.',
      );
    if (st.backPockets === 'welt')
      add('Welt pockets', 'Mark, interface and cut the welt openings; attach the welts and bags.');
    if (st.cargoPockets)
      add(
        'Cargo pockets',
        'Press the box pleat, hem and attach the pockets; sew the flaps above with a buttonhole.',
      );
    if (st.pockets === 'slant' || st.pockets === 'scoop')
      add(
        st.pockets === 'scoop' ? 'Scoop pockets' : 'Slant pockets',
        'Sew the pocket bag to the pocket opening, understitch, then join the side front to the bag and baste it at the waist and side.',
      );
    else if (has('pocket_bags')) add('Pockets', 'Make the side-seam pockets on the front legs.');
    if (st.pleats !== 'none')
      add(
        'Front pleats',
        'Fold the pleats towards the side at the marks and baste across the waist.',
      );
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
    if (spec.family === 'jumpsuit')
      add(
        'Join bodice and legs',
        'Sew the legs to the bodice at the waist matching side seams and CF/CB; press up.',
      );
  }
  if (closure === 'back_zip' || closure === 'side_zip')
    add(
      'Insert zip',
      `Insert the ${closure === 'back_zip' ? 'centre back' : 'side'} zip; finish the seam below it.`,
    );
  if (has('belt_loops'))
    add(
      'Belt loops',
      `Fold the strip in thirds, topstitch and cut into ${st.beltLoops} loops; baste them to the waist at the marks.`,
    );
  if (has('waistband'))
    add(
      'Attach waistband',
      st.waistbandType === 'elastic' || st.waistbandType === 'drawstring'
        ? `Join the band into a loop, sew to the waist, insert the elastic${st.waistbandType === 'drawstring' ? ' and the drawstring through the eyelets' : ''} and close.`
        : 'Sew the waistband to the waist matching notches, fold, close the ends and stitch in the ditch' +
            (st.waistbandType === 'elastic_back' ? '; thread elastic through the back half' : '') +
            '.',
    );
  if (has('belt_loops'))
    add('Secure belt loops', 'Fold the loops up over the band and bartack them at the top.');
  if (has('ribs'))
    add(
      'Rib bands',
      'Join the rib bands into loops, fold, quarter and stretch-sew to the hem and sleeve ends.',
    );
  if (has('lining'))
    add(
      'Lining',
      'Assemble the lining, sew it to the facings, bag out through a sleeve and close.',
    );
  if (has('ruffles'))
    add('Ruffles', 'Narrow-hem the ruffles, gather and sew them on at the marked edges.');
  if (spec.family === 'dungarees')
    add(
      'Attach bibs and straps',
      'Sew the bibs to the waist, cross the straps at the back and sew the buttonholes and buttons.',
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
