import {
  garmentSpec,
  garmentsOf,
  type PatternSpec,
  type PatternSpecInput,
  patternSpecSchema,
} from '@ai-designer/garment-model';

import { draftBodice } from './bodice.js';
import {
  draftBackPockets,
  draftBeltLoops,
  draftBottomWaistband,
  draftCargoPockets,
  draftFrontPatchPockets,
} from './bottoms.js';
import {
  draftArmholeBinding,
  draftNeckFinish,
  draftPatchPocket,
  draftPocketBag,
} from './collar.js';
import {
  draftPleatedSkirt,
  draftRuffles,
  draftTies,
  draftTiers,
  frockFromBodice,
  wrapFront,
} from './extras.js';
import { type DraftPiece, edgeLength, mark, P, roundPiece } from './geom.js';
import {
  draftButtonPlacket,
  draftFrontFacing,
  draftHood,
  draftKangaroo,
  draftLinings,
  draftRibBands,
  draftSleevePlackets,
  sleeveSlit,
} from './jacket.js';
import { type Ctx, garmentName, lengthFor, resolve } from './resolve.js';
import { draftSkirt, draftWaistband, waistOf } from './skirt.js';
import { draftSleeve } from './sleeve.js';
import { draftTrousers, type TrouserOptions } from './trousers.js';

/**
 * `draftPattern(spec)` — the pattern engine (ADR-058/061). Pure and deterministic: the same spec
 * always gives the same pieces. Pieces are grouped into garment parts (components) for the design
 * state. A co-ord set drafts every garment with the same body; each garment becomes a
 * `set_garment` part and its part keys / piece templates are prefixed with the garment key.
 */

export interface DraftPart {
  /** Stable key (redrafts keep the component), e.g. `sleeves`, `shorts.legs`. */
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

export function draftPattern(input: PatternSpec | PatternSpecInput): PatternDraft {
  const spec = patternSpecSchema.parse(input);
  if (!spec.garments.length) return draftGarment(spec);
  const drafts = garmentsOf(spec).map((g) => ({
    key: g.key,
    draft: draftGarment(garmentSpec(spec, g.key)),
  }));
  const names = drafts.map((d) => d.draft.rootName);
  const pieceNames = new Map<string, number>();
  for (const d of drafts)
    for (const part of d.draft.parts)
      for (const p of part.pieces) pieceNames.set(p.name, (pieceNames.get(p.name) ?? 0) + 1);
  const parts: DraftPart[] = [];
  for (const { key, draft } of drafts) {
    const pre = (k: string) => (key === 'main' ? k : `${key}.${k}`);
    const groupKey = `g.${key}`;
    parts.push({
      key: groupKey,
      componentType: 'set_garment',
      name: draft.rootName,
      side: 'none',
      parentKey: 'body',
      pieces: [],
    });
    for (const part of draft.parts)
      parts.push({
        ...part,
        key: pre(part.key),
        parentKey: part.parentKey === 'body' ? groupKey : pre(part.parentKey),
        pieces: part.pieces.map((p) => ({
          ...p,
          template: pre(p.template),
          // Same piece name in two garments (Front…): say which garment.
          name:
            (pieceNames.get(p.name) ?? 0) > 1
              ? `${draft.rootName} ${p.name.toLowerCase()}`
              : p.name,
        })),
      });
  }
  return {
    spec,
    category: 'coord_set',
    garmentType: 'set',
    rootName: `${names.join(' + ')} set`,
    parts,
    notes: drafts.flatMap((d) =>
      d.draft.notes.map((n) => (d.key === 'main' ? n : `${d.draft.rootName}: ${n}`)),
    ),
  };
}

/** One garment (no set). */
export function draftGarment(spec: PatternSpec): PatternDraft {
  const ctx = resolve(spec);
  const parts: DraftPart[] = [];
  const add: Add = (key, componentType, name, pieces, parentKey = 'body', side = 'none') => {
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
    case 'jumpsuit':
      jumpsuit(ctx, add);
      break;
    case 'jacket':
      jacket(ctx, add);
      break;
    case 'dungarees':
      dungarees(ctx, add);
      break;
  }
  const category =
    spec.family === 'top'
      ? spec.style.topType === 'tshirt'
        ? 'knit_tshirt'
        : 'woven_shirt'
      : spec.family === 'jacket'
        ? ctx.knit
          ? 'hoodie'
          : 'jacket'
        : spec.family;
  const garmentType =
    spec.family === 'top'
      ? spec.style.topType === 'tshirt'
        ? 'tshirt'
        : 'shirt'
      : spec.family === 'jacket' && ctx.knit
        ? 'hoodie'
        : spec.family;
  return { spec, category, garmentType, rootName: garmentName(spec), parts, notes: ctx.notes };
}

type Add = (
  key: string,
  componentType: string,
  name: string,
  pieces: DraftPiece[],
  parentKey?: string,
  side?: 'none' | 'center',
) => void;

const len = (p: DraftPiece | undefined, edge: string) => {
  const e = p?.edges.find((x) => x.name === edge);
  return p && e ? edgeLength(p.outline, e) : 0;
};

/** Sleeves, cuffs, collar / neck finish, chest pockets, plackets, ribs — everything above the waist. */
function upper(
  ctx: Ctx,
  add: Add,
  b: ReturnType<typeof draftBodice>,
  front: DraftPiece,
): { sleeve?: DraftPiece; neck: number } {
  const { style } = ctx;
  if (b.yoke) add('yoke', 'yoke', 'Yoke', [b.yoke]);
  let sleevePiece: DraftPiece | undefined;
  if (style.sleeve !== 'none') {
    // Rib cuffs replace the sleeve's own cuff.
    const sctx = style.ribbing ? { ...ctx, style: { ...style, cuff: 'none' as const } } : ctx;
    const s = draftSleeve(sctx, { front: b.frontArmhole, back: b.backArmhole });
    const [sleeve, ...rest] = s.pieces;
    sleevePiece = sleeve!;
    const cuff = rest.find((p) => p.template === 'cuff' || p.template === 'sleeve_band');
    if (
      cuff?.template === 'cuff' &&
      (style.sleeve === 'long' || style.sleeve === 'three_quarter')
    ) {
      // Shirt cuff on a long sleeve: placket slit in the back half of the sleeve hem.
      const hem = sleevePiece.edges.find((e) => e.name === 'hem');
      if (hem) {
        const a = sleevePiece.outline[hem.from]!;
        const z = sleevePiece.outline[hem.to]!;
        const x = a.x + (z.x - a.x) * 0.25;
        const y = Math.max(a.y, z.y);
        sleevePiece = {
          ...sleevePiece,
          markings: [
            ...sleevePiece.markings,
            mark('line', [P(x, y), P(x, y - sleeveSlit(ctx))], 'placket slit'),
          ],
        };
      }
    }
    add('sleeves', 'sleeve', 'Sleeves', [sleevePiece], 'body', 'center');
    if (cuff)
      add(
        'cuffs',
        'cuff',
        cuff.template === 'cuff' ? 'Cuffs' : 'Sleeve bands',
        [cuff],
        'sleeves',
        'center',
      );
    if (cuff?.template === 'cuff' && (style.sleeve === 'long' || style.sleeve === 'three_quarter'))
      add(
        'sleeve_plackets',
        'placket',
        'Sleeve plackets',
        draftSleevePlackets(ctx),
        'sleeves',
        'center',
      );
  } else if (!style.ribbing)
    add('armhole_finish', 'facing', 'Armhole binding', [draftArmholeBinding(ctx, b)]);
  if (style.hood) add('hood', 'hood', 'Hood', draftHood(ctx, b));
  const neck = draftNeckFinish(ctx, b);
  const collar = neck.filter((p) => ['collar', 'collar_stand', 'collar_band'].includes(p.template));
  const stand = collar.find((p) => p.template === 'collar_stand');
  const main = collar.find((p) => p.template !== 'collar_stand');
  if (main) add('collar', 'collar', main.name, [main]);
  if (stand) add('collar_stand', 'collar_stand', 'Collar stand', [stand], main ? 'collar' : 'body');
  const band = neck.filter((p) => p.template === 'neckband');
  if (band.length) add('neckband', 'neckline', 'Neckband', band);
  const facings = neck.filter((p) => p.template.startsWith('facing'));
  if (b.lapel || (style.closure === 'front_zip' && style.collar !== 'none'))
    facings.unshift(draftFrontFacing(ctx, b, front));
  if (facings.length)
    add('neck_facing', 'facing', facings.length > 1 ? 'Facings' : facings[0]!.name, facings);
  if (style.closure === 'front_buttons' && style.placket === 'separate' && !b.lapel)
    add('placket', 'placket', 'Button placket', [draftButtonPlacket(ctx, b, front)]);
  if (style.pockets === 'patch') {
    const p = draftPatchPocket(ctx);
    add('pockets', 'pocket', style.pocketCount > 1 ? 'Chest pockets' : 'Chest pocket', [
      {
        ...p,
        name: ctx.spec.family === 'dress' ? 'Patch pocket' : 'Chest pocket',
        cutQuantity: ctx.spec.family === 'dress' ? 2 : style.pocketCount,
      },
    ]);
  }
  if (style.pockets === 'kangaroo')
    add('pockets', 'pocket', 'Kangaroo pocket', [draftKangaroo(ctx)]);
  return { sleeve: sleevePiece, neck: 2 * (b.frontNeck + b.backNeck) };
}

/** Placement of chest pockets on the front (left chest; both sides when two). */
function chestPocketMarks(ctx: Ctx, b: ReturnType<typeof draftBodice>) {
  if (ctx.style.pockets !== 'patch' || ctx.spec.family === 'dress') return [];
  const w = ctx.kids ? 90 : 125;
  const y = b.underarmY - (ctx.kids ? 35 : 55);
  const x = ctx.kids ? 35 : 55;
  return [
    mark(
      'placement',
      [P(x, y), P(x + w, y)],
      ctx.style.pocketCount > 1 ? 'chest pocket (both fronts)' : 'chest pocket (left front)',
    ),
  ];
}

function withMarks(p: DraftPiece, marks: DraftPiece['markings']): DraftPiece {
  return marks.length ? { ...p, markings: [...p.markings, ...marks] } : p;
}

function hemCurveFor(ctx: Ctx): number {
  const h = ctx.style.hemShape;
  const shirt = ctx.spec.family === 'top' && ctx.style.topType === 'shirt';
  const curve = ctx.kids ? 30 : 45;
  return h === 'curved' ? curve : h === 'straight' ? 0 : shirt ? curve : 0;
}

/** Style tweaks for a wrap front: deep V to the waist, no other opening. */
function wrapCtx(ctx: Ctx): Ctx {
  if (!ctx.style.wrap) return ctx;
  return {
    ...ctx,
    style: {
      ...ctx.style,
      neckline: 'v_neck',
      collar: 'none',
      neckDepthMm: ctx.style.neckDepthMm ?? Math.round(ctx.m.back_length - 30),
      closure: 'none',
    },
  };
}

function ruffleParts(
  ctx: Ctx,
  add: Add,
  edges: { hem?: number; neckline?: number; sleeve?: number },
) {
  const r = draftRuffles(ctx, edges);
  if (r.length) add('ruffles', 'ruffle', 'Ruffles', r);
}

function dress(ctx0: Ctx, add: Add) {
  const ctx = wrapCtx(ctx0);
  const { style } = ctx;
  const overlap = Math.round((ctx.m.waist + ctx.ease.waist) / 8);
  if (style.yoke) {
    // Frock: yoke across the chest, gathered skirt below.
    const L = 20 + ctx.m.back_length + lengthFor(ctx, 'skirt');
    // `yoke` means the frock yoke here, not a shirt back yoke.
    const fctx: Ctx = { ...ctx, style: { ...style, yoke: false } };
    const b = draftBodice(fctx, { kind: 'length', lengthMm: L, flare: 60 });
    const yokeY = Math.round(b.underarmY - (ctx.kids ? 15 : 25));
    const frock = frockFromBodice(ctx, { front: b.front, back: b.back }, yokeY);
    add(
      'front',
      'front_body_panel',
      'Front',
      frock.filter((p) => p.template.endsWith('front')),
    );
    add(
      'back',
      'back_body_panel',
      'Back',
      frock.filter((p) => p.template.endsWith('back')),
    );
    const u = upper(fctx, add, b, b.front);
    ruffleParts(ctx, add, {
      hem: frock
        .filter((p) => p.template.startsWith('frock'))
        .reduce((s, p) => s + 2 * len(p, 'hem'), 0),
      neckline: u.neck,
      sleeve: len(u.sleeve, 'hem'),
    });
  } else if (style.waistSeam) {
    const b = draftBodice(ctx, { kind: 'waist' });
    const front = style.wrap ? wrapFront(ctx, b.front, overlap) : b.front;
    add('front', 'front_body_panel', 'Bodice front', [withMarks(front, chestPocketMarks(ctx, b))]);
    add('back', 'back_body_panel', 'Bodice back', [b.back]);
    const u = upper(ctx, add, b, front);
    const waistFull = 2 * (b.frontWaist + b.backWaist);
    const L = lengthFor(ctx, 'skirt');
    let skirtPieces: DraftPiece[];
    if (style.skirt === 'tiered') skirtPieces = draftTiers(ctx, waistFull, L);
    else if (style.skirt === 'pleated') skirtPieces = draftPleatedSkirt(ctx, waistFull, L);
    else
      skirtPieces = draftSkirt(ctx, {
        frontWaist: b.frontWaist,
        backWaist: b.backWaist,
        forDress: true,
        extension: b.extension,
      }).pieces;
    if (style.wrap)
      skirtPieces = skirtPieces.map((p) =>
        p.template === 'skirt_front' ? wrapFront(ctx, p, overlap) : p,
      );
    add('skirt', 'skirt_panel', style.skirt === 'tiered' ? 'Tiered skirt' : 'Skirt', skirtPieces);
    if (style.wrap) add('ties', 'custom', 'Ties', [draftTies(ctx, waistFull)]);
    ruffleParts(ctx, add, {
      hem: skirtPieces.reduce((s, p) => s + 2 * len(p, 'hem'), 0),
      neckline: u.neck,
      sleeve: len(u.sleeve, 'hem'),
    });
  } else {
    const L = 20 + ctx.m.back_length + lengthFor(ctx, 'skirt');
    const flare =
      style.skirt === 'a_line'
        ? 70
        : ['flared', 'circle', 'half_circle', 'gathered', 'tiered', 'pleated'].includes(style.skirt)
          ? 150
          : style.skirt === 'pencil'
            ? -15
            : 0;
    const b = draftBodice(ctx, { kind: 'length', lengthMm: L, flare });
    const front = style.wrap ? wrapFront(ctx, b.front, overlap) : b.front;
    add('front', 'front_body_panel', 'Front', [front]);
    add('back', 'back_body_panel', 'Back', [b.back]);
    const u = upper(ctx, add, b, front);
    if (style.wrap) add('ties', 'custom', 'Ties', [draftTies(ctx, ctx.m.waist + ctx.ease.waist)]);
    ruffleParts(ctx, add, {
      hem: 2 * (len(front, 'hem') + len(b.back, 'hem')),
      neckline: u.neck,
      sleeve: len(u.sleeve, 'hem'),
    });
  }
  if (style.pockets === 'side_seam' || style.pockets === 'slant')
    add('pocket_bags', 'pocket', 'Side-seam pockets', [draftPocketBag(ctx)]);
}

function top(ctx0: Ctx, add: Add) {
  const ctx = wrapCtx(ctx0);
  const { style } = ctx;
  if (style.peplum) {
    const b = draftBodice(ctx, { kind: 'waist' });
    const front = style.wrap
      ? wrapFront(ctx, b.front, Math.round((ctx.m.waist + ctx.ease.waist) / 8))
      : b.front;
    add('front', 'front_body_panel', 'Bodice front', [front]);
    add('back', 'back_body_panel', 'Bodice back', [b.back]);
    const u = upper(ctx, add, b, front);
    const pctx: Ctx = {
      ...ctx,
      style: { ...style, skirt: 'half_circle', lengthMm: ctx.kids ? 90 : 150, waistband: false },
    };
    const pep = draftSkirt(pctx, {
      frontWaist: b.frontWaist,
      backWaist: b.backWaist,
      forDress: true,
    }).pieces.map((p) => ({ ...p, name: p.name.replace('Skirt', 'Peplum') }));
    add('peplum', 'skirt_panel', 'Peplum', pep);
    if (style.wrap)
      add('ties', 'custom', 'Ties', [draftTies(ctx, 2 * (b.frontWaist + b.backWaist))]);
    ruffleParts(ctx, add, { neckline: u.neck, sleeve: len(u.sleeve, 'hem') });
    return;
  }
  const b = draftBodice(ctx, {
    kind: 'length',
    lengthMm: lengthFor(ctx, 'top'),
    hemCurve: hemCurveFor(ctx),
  });
  const front = withMarks(
    style.wrap ? wrapFront(ctx, b.front, Math.round((ctx.m.bust + ctx.ease.bust) / 10)) : b.front,
    chestPocketMarks(ctx, b),
  );
  add('front', 'front_body_panel', 'Front', [front]);
  add('back', 'back_body_panel', 'Back', [b.back]);
  const u = upper(ctx, add, b, front);
  if (style.wrap) add('ties', 'custom', 'Ties', [draftTies(ctx, ctx.m.waist + ctx.ease.waist)]);
  ruffleParts(ctx, add, {
    hem: 2 * (len(front, 'hem') + len(b.back, 'hem')),
    neckline: u.neck,
    sleeve: len(u.sleeve, 'hem'),
  });
}

function jacket(ctx: Ctx, add: Add) {
  const { style } = ctx;
  const b = draftBodice(ctx, {
    kind: 'length',
    lengthMm: lengthFor(ctx, 'top') - (style.ribbing ? (ctx.kids ? 45 : 65) : 0),
    hemCurve: hemCurveFor(ctx),
  });
  const kangarooMark =
    style.pockets === 'kangaroo'
      ? [
          mark(
            'placement',
            [
              P(0, b.frontHemY - (ctx.kids ? 170 : 240)),
              P(ctx.kids ? 75 : 110, b.frontHemY - (ctx.kids ? 170 : 240)),
            ],
            'kangaroo pocket top',
          ),
        ]
      : [];
  const front = withMarks(b.front, [...chestPocketMarks(ctx, b), ...kangarooMark]);
  add('front', 'front_body_panel', 'Front', [front]);
  add('back', 'back_body_panel', 'Back', [b.back]);
  const u = upper(ctx, add, b, front);
  if (style.ribbing)
    add(
      'ribs',
      'hem',
      'Rib bands',
      draftRibBands(ctx, { front, back: b.back, ...(u.sleeve ? { sleeve: u.sleeve } : {}) }),
    );
  if (style.pockets === 'slant' || style.pockets === 'side_seam')
    add('pocket_bags', 'pocket', 'Side pockets', [draftPocketBag(ctx)]);
  if (style.lining)
    add(
      'lining',
      'lining',
      'Lining',
      draftLinings(ctx, [front, b.back, ...(u.sleeve ? [u.sleeve] : [])]),
    );
}

function skirt(ctx0: Ctx, add: Add) {
  const ctx = ctx0;
  const { style } = ctx;
  const s = draftSkirt(ctx);
  const waistFull = s.waist;
  const L = lengthFor(ctx, 'skirt');
  let pieces = s.pieces;
  if (style.skirt === 'tiered') pieces = draftTiers(ctx, waistFull, L);
  else if (style.skirt === 'pleated') pieces = draftPleatedSkirt(ctx, waistFull, L);
  if (style.wrap) {
    const overlap = Math.round(waistFull / 6);
    pieces = pieces.map((p) => (p.template === 'skirt_front' ? wrapFront(ctx, p, overlap) : p));
  }
  add('skirt', 'skirt_panel', style.skirt === 'tiered' ? 'Tiered skirt' : 'Skirt', pieces);
  if (style.waistband) {
    add('waistband', 'waistband', 'Waistband', draftBottomWaistband(ctx, waistFull));
    const loops = draftBeltLoops(ctx);
    if (loops) add('belt_loops', 'belt_loop', 'Belt loops', [loops], 'waistband');
  } else ctx.notes.push('No waistband: finish the waist with a facing or bias binding');
  if (style.wrap) add('ties', 'custom', 'Ties', [draftTies(ctx, waistFull)]);
  if (style.pockets === 'side_seam' || style.pockets === 'slant' || style.pockets === 'scoop')
    add('pocket_bags', 'pocket', 'Side-seam pockets', [draftPocketBag(ctx)]);
  if (style.pockets === 'patch')
    add('pockets', 'pocket', 'Front patch pockets', [draftFrontPatchPockets(ctx)]);
  ruffleParts(ctx, add, { hem: pieces.reduce((t, p) => t + 2 * len(p, 'hem'), 0) });
}

/** Legs with their pockets, fly, back/cargo pockets (shared by trousers, jumpsuits, dungarees). */
function legs(ctx: Ctx, add: Add, opts: TrouserOptions = {}) {
  const t = draftTrousers(ctx, opts);
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
  const st = ctx.style;
  if (t.pocketPieces.length)
    add(
      'pocket_bags',
      'pocket',
      st.pockets === 'scoop' ? 'Scoop pockets' : 'Slant pockets',
      t.pocketPieces,
    );
  else if (st.pockets === 'side_seam')
    add('pocket_bags', 'pocket', 'Side-seam pockets', [draftPocketBag(ctx)]);
  else if (st.pockets === 'patch')
    add('pockets', 'pocket', 'Front patch pockets', [draftFrontPatchPockets(ctx)]);
  const back = draftBackPockets(ctx);
  if (back.length) add('back_pockets', 'pocket', 'Back pockets', back);
  const cargo = draftCargoPockets(ctx);
  if (cargo.length) add('cargo_pockets', 'pocket', 'Cargo pockets', cargo);
  return t;
}

function trousers(ctx: Ctx, add: Add) {
  const t = legs(ctx, add);
  if (ctx.style.waistband) {
    add(
      'waistband',
      'waistband',
      'Waistband',
      draftBottomWaistband(ctx, t.waist, { frontWaist: t.frontWaist, backWaist: t.backWaist }),
    );
    const loops = draftBeltLoops(ctx);
    if (loops) add('belt_loops', 'belt_loop', 'Belt loops', [loops], 'waistband');
  } else ctx.notes.push('No waistband: finish the waist with a facing');
}

function jumpsuit(ctx: Ctx, add: Add) {
  const { style } = ctx;
  const b = draftBodice(ctx, { kind: 'waist' });
  add('front', 'front_body_panel', 'Bodice front', [withMarks(b.front, chestPocketMarks(ctx, b))]);
  add('back', 'back_body_panel', 'Bodice back', [b.back]);
  upper(ctx, add, b, b.front);
  // The legs join the bodice at the waist: same finished waist, a little more rise, no band.
  const lctx: Ctx = {
    ...ctx,
    style: {
      ...style,
      waistband: false,
      closure: style.closure === 'fly_zip' ? 'fly_zip' : 'none',
      pleats: style.pleats,
    },
  };
  legs(lctx, add, { waistTarget: 2 * (b.frontWaist + b.backWaist), riseExtra: ctx.kids ? 15 : 25 });
  if (style.closure === 'back_zip')
    ctx.notes.push('The back zip runs from the neck into the centre back seam of the legs');
  if (style.beltLoops) {
    const loops = draftBeltLoops(ctx);
    if (loops) add('belt_loops', 'belt_loop', 'Belt loops', [loops]);
  }
}

function dungarees(ctx: Ctx, add: Add) {
  const { style } = ctx;
  const lctx: Ctx = { ...ctx, style: { ...style, closure: 'none' } };
  const t = legs(lctx, add, { riseExtra: ctx.kids ? 10 : 20 });
  if (style.waistband)
    add('waistband', 'waistband', 'Waistband', draftBottomWaistband(lctx, t.waist));
  const halfW = Math.round(((ctx.kids ? 0.24 : 0.22) * (ctx.m.bust + ctx.ease.bust)) / 2);
  const h = ctx.kids ? 170 : 240;
  const bib = (name: string, template: string, height: number) => {
    return {
      template,
      name,
      outline: [P(0, 0), P(halfW, 0), P(halfW + 8, height), P(0, height)],
      edges: [
        { name: 'top', from: 0, to: 1, intakeMm: 0 },
        { name: 'side', from: 1, to: 2, intakeMm: 0 },
        { name: 'waist', from: 2, to: 3, intakeMm: 0 },
        { name: 'cf', from: 3, to: 0, intakeMm: 0 },
      ],
      markings: [mark('button', [P(halfW - 18, 20)], 'strap button')],
      grainline: { from: P(halfW * 0.4, 20), to: P(halfW * 0.4, height - 20) },
      foldLine: { from: P(0, 0), to: P(0, height) },
      notches: [],
      cutQuantity: 2,
      mirrored: false,
      fabricRole: 'main',
      notes: ['Cut 2 on the fold (outer + facing)'],
      inputs: { width: halfW * 2, height },
    } satisfies DraftPiece;
  };
  add('bib', 'bib', 'Bibs', [
    bib('Front bib', 'bib_front', h),
    bib('Back bib', 'bib_back', Math.round(h * 0.6)),
  ]);
  const strapW = ctx.kids ? 30 : 40;
  const strapL = Math.round(ctx.m.back_length + h * 0.4 + (ctx.kids ? 120 : 180));
  add('straps', 'strap', 'Straps', [
    {
      template: 'strap',
      name: 'Strap',
      outline: [P(0, 0), P(strapW * 2, 0), P(strapW * 2, strapL), P(0, strapL)],
      edges: [
        { name: 'end', from: 0, to: 1, intakeMm: 0 },
        { name: 'long', from: 1, to: 2, intakeMm: 0 },
        { name: 'end_b', from: 2, to: 3, intakeMm: 0 },
        { name: 'long_b', from: 3, to: 0, intakeMm: 0 },
      ],
      markings: [
        mark('buttonhole', [P(strapW, strapL - 25)]),
        mark('buttonhole', [P(strapW, strapL - 60)]),
      ],
      grainline: { from: P(strapW, 20), to: P(strapW, strapL - 20) },
      foldLine: { from: P(strapW, 0), to: P(strapW, strapL) },
      notches: [],
      cutQuantity: 2,
      mirrored: false,
      fabricRole: 'main',
      notes: ['Cut 2; fold, stitch, turn; cross at the back, button to the bib'],
      inputs: { length: strapL, width: strapW },
    },
  ]);
  if (style.pockets === 'patch')
    add(
      'bib_pocket',
      'pocket',
      'Bib pocket',
      [{ ...draftPatchPocket(ctx), template: 'bib_pocket', name: 'Bib pocket', cutQuantity: 1 }],
      'bib',
    );
  ctx.notes.push('Side openings at the top of the outseams close with 2 buttons each');
}

export { draftWaistband, waistOf };
