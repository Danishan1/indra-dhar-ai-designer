import type { PatternSpec, PatternSpecInput } from '@ai-designer/garment-model';

import { draftBodice } from './bodice.js';
import {
  draftArmholeBinding,
  draftNeckFinish,
  draftPatchPocket,
  draftPocketBag,
} from './collar.js';
import { type DraftPiece, roundPiece } from './geom.js';
import { type Ctx, lengthFor, resolve } from './resolve.js';
import { draftSkirt, draftWaistband, waistOf } from './skirt.js';
import { draftSleeve } from './sleeve.js';
import { draftTrousers } from './trousers.js';

/**
 * `draftPattern(spec)` — the pattern engine (ADR-058). Pure and deterministic: the same spec always
 * gives the same pieces. Pieces are grouped into garment parts (components) for the design state.
 */

export interface DraftPart {
  /** Stable key (redrafts keep the component), e.g. `sleeves`. */
  key: string;
  componentType: string;
  name: string;
  side: 'none' | 'center';
  /** Key of the parent part (`body` = the garment root). */
  parentKey: string;
  pieces: DraftPiece[];
}

export interface PatternDraft {
  spec: PatternSpec;
  category: string;
  garmentType: string;
  rootName: string;
  parts: DraftPart[];
  notes: string[];
}

const ROOT_NAME: Record<string, string> = {
  dress: 'Dress',
  skirt: 'Skirt',
  trousers: 'Trousers',
};

export function draftPattern(input: PatternSpec | PatternSpecInput): PatternDraft {
  const ctx = resolve(input);
  const { spec } = ctx;
  const parts: DraftPart[] = [];
  const add = (
    key: string,
    componentType: string,
    name: string,
    pieces: DraftPiece[],
    parentKey = 'body',
    side: 'none' | 'center' = 'none',
  ) => {
    if (pieces.length)
      parts.push({ key, componentType, name, side, parentKey, pieces: pieces.map(roundPiece) });
  };
  switch (spec.family) {
    case 'dress':
      dress(ctx, add);
      break;
    case 'top':
      top(ctx, add);
      break;
    case 'skirt':
      skirt(ctx, add);
      break;
    case 'trousers':
      trousers(ctx, add);
      break;
  }
  const category =
    spec.family === 'top'
      ? spec.style.topType === 'tshirt'
        ? 'knit_tshirt'
        : 'woven_shirt'
      : spec.family;
  const garmentType =
    spec.family === 'top' ? (spec.style.topType === 'tshirt' ? 'tshirt' : 'shirt') : spec.family;
  const rootName =
    spec.family === 'top'
      ? { blouse: 'Blouse', shirt: 'Shirt', tshirt: 'T-shirt' }[spec.style.topType]
      : ROOT_NAME[spec.family]!;
  return { spec, category, garmentType, rootName, parts, notes: ctx.notes };
}

type Add = (
  key: string,
  componentType: string,
  name: string,
  pieces: DraftPiece[],
  parentKey?: string,
  side?: 'none' | 'center',
) => void;

function upper(ctx: Ctx, add: Add, b: ReturnType<typeof draftBodice>) {
  const { style } = ctx;
  if (b.yoke) add('yoke', 'yoke', 'Yoke', [b.yoke]);
  if (style.sleeve !== 'none') {
    const s = draftSleeve(ctx, { front: b.frontArmhole, back: b.backArmhole });
    const [sleeve, ...rest] = s.pieces;
    add('sleeves', 'sleeve', 'Sleeves', [sleeve!], 'body', 'center');
    const cuff = rest.find((p) => p.template === 'cuff' || p.template === 'sleeve_band');
    if (cuff)
      add(
        'cuffs',
        'cuff',
        cuff.template === 'cuff' ? 'Cuffs' : 'Sleeve bands',
        [cuff],
        'sleeves',
        'center',
      );
  } else add('armhole_finish', 'facing', 'Armhole binding', [draftArmholeBinding(ctx, b)]);
  const neck = draftNeckFinish(ctx, b);
  const collar = neck.filter((p) => ['collar', 'collar_stand', 'collar_band'].includes(p.template));
  const stand = collar.find((p) => p.template === 'collar_stand');
  const main = collar.find((p) => p.template !== 'collar_stand');
  if (main) add('collar', 'collar', main.name, [main]);
  if (stand) add('collar_stand', 'collar_stand', 'Collar stand', [stand], main ? 'collar' : 'body');
  const band = neck.filter((p) => p.template === 'neckband');
  if (band.length) add('neckband', 'neckline', 'Neckband', band);
  const facings = neck.filter((p) => p.template.startsWith('facing'));
  if (facings.length) add('neck_facing', 'facing', 'Neck facings', facings);
  if (style.pockets === 'patch') add('pockets', 'pocket', 'Patch pocket', [draftPatchPocket(ctx)]);
}

function dress(ctx: Ctx, add: Add) {
  const { style } = ctx;
  if (style.waistSeam) {
    const b = draftBodice(ctx, { kind: 'waist' });
    add('front', 'front_body_panel', 'Bodice front', [b.front]);
    add('back', 'back_body_panel', 'Bodice back', [b.back]);
    upper(ctx, add, b);
    const s = draftSkirt(ctx, {
      frontWaist: b.frontWaist,
      backWaist: b.backWaist,
      forDress: true,
      extension: b.extension,
    });
    add('skirt', 'skirt_panel', 'Skirt', s.pieces);
  } else {
    const L = 20 + ctx.m.back_length + lengthFor(ctx, 'skirt');
    const flare =
      style.skirt === 'a_line'
        ? 70
        : style.skirt === 'flared' ||
            style.skirt === 'circle' ||
            style.skirt === 'half_circle' ||
            style.skirt === 'gathered'
          ? 150
          : style.skirt === 'pencil'
            ? -15
            : 0;
    const b = draftBodice(ctx, { kind: 'length', lengthMm: L, flare });
    add('front', 'front_body_panel', 'Front', [b.front]);
    add('back', 'back_body_panel', 'Back', [b.back]);
    upper(ctx, add, b);
  }
  if (style.pockets === 'side_seam')
    add('pocket_bags', 'pocket', 'Side-seam pockets', [draftPocketBag(ctx)]);
}

function top(ctx: Ctx, add: Add) {
  const { style } = ctx;
  const shirt = style.topType === 'shirt';
  const b = draftBodice(ctx, {
    kind: 'length',
    lengthMm: lengthFor(ctx, 'top'),
    hemCurve: shirt ? 45 : 0,
  });
  add('front', 'front_body_panel', 'Front', [b.front]);
  add('back', 'back_body_panel', 'Back', [b.back]);
  upper(ctx, add, b);
}

function skirt(ctx: Ctx, add: Add) {
  const s = draftSkirt(ctx);
  add('skirt', 'skirt_panel', 'Skirt', s.pieces);
  if (ctx.style.waistband)
    add('waistband', 'waistband', 'Waistband', [draftWaistband(ctx, s.waist)]);
  else ctx.notes.push('No waistband: finish the waist with a facing or bias binding');
  if (ctx.style.pockets === 'side_seam')
    add('pocket_bags', 'pocket', 'Side-seam pockets', [draftPocketBag(ctx)]);
}

function trousers(ctx: Ctx, add: Add) {
  const t = draftTrousers(ctx);
  add(
    'legs',
    'leg_panel',
    'Legs',
    t.pieces.filter((p) => p.template.startsWith('trouser')),
    'body',
    'center',
  );
  const fly = t.pieces.filter((p) => p.template.startsWith('fly'));
  if (fly.length) add('fly', 'facing', 'Fly', fly);
  if (ctx.style.waistband)
    add('waistband', 'waistband', 'Waistband', [draftWaistband(ctx, t.waist)]);
  if (ctx.style.pockets !== 'none')
    add('pocket_bags', 'pocket', 'Side-seam pockets', [draftPocketBag(ctx)]);
}

export { waistOf };
