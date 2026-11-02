import {
  createPatternPieceId,
  type DesignComponent,
  type GarmentDesignState,
  lengthMm,
  type PatternPiece,
  type PatternPoint,
  type RandomBytes,
} from '@ai-designer/garment-model';

/**
 * Parametric drafting of flat pattern pieces (ADR-056). These are **provisional blocks** drawn from
 * the component's measurements (or family defaults when a measurement is missing — always noted on
 * the piece). They show the pieces a garment needs and their proportions; they are not graded,
 * production-ready patterns.
 */

type Inputs = Record<string, number>;

/** Default measurements (mm) per garment family; used only when the design has no value. */
const DEFAULTS: Record<string, Inputs> = {
  shirt: {
    body_length: 780,
    chest_width: 560,
    shoulder_width: 460,
    neck_width: 170,
    sleeve_length: 620,
    sleeve_opening: 250,
    cuff_width: 65,
    collar_height: 40,
    collar_stand_height: 30,
    placket_width: 32,
    hem_depth: 8,
  },
  tshirt: {
    body_length: 700,
    chest_width: 520,
    shoulder_width: 440,
    neck_width: 180,
    sleeve_length: 200,
    sleeve_opening: 340,
    cuff_width: 25,
    collar_height: 20,
    placket_width: 30,
    hem_depth: 20,
  },
  dress: {
    body_length: 1050,
    chest_width: 460,
    shoulder_width: 380,
    neck_width: 170,
    sleeve_length: 250,
    sleeve_opening: 300,
    waist_width: 360,
    hip_width: 480,
    skirt_length: 620,
    cuff_width: 40,
    collar_height: 35,
    placket_width: 25,
    waistband_height: 35,
  },
  skirt: { waist_width: 360, hip_width: 480, skirt_length: 600, waistband_height: 35 },
  trousers: {
    waist_width: 400,
    hip_width: 520,
    inseam: 780,
    leg_opening: 200,
    rise: 280,
    waistband_height: 40,
  },
  jacket: {
    body_length: 720,
    chest_width: 580,
    shoulder_width: 470,
    neck_width: 180,
    sleeve_length: 640,
    sleeve_opening: 280,
    cuff_width: 60,
    collar_height: 70,
    placket_width: 40,
  },
  hoodie: {
    body_length: 700,
    chest_width: 580,
    shoulder_width: 480,
    neck_width: 200,
    sleeve_length: 640,
    sleeve_opening: 220,
    cuff_width: 70,
    hood_height: 360,
    hem_depth: 70,
  },
};

const FAMILY_FALLBACK = 'shirt';

/** Measurements of the whole garment (shared by every piece), not of one component. */
const BODY_MEASUREMENTS = new Set([
  'body_length',
  'chest_width',
  'shoulder_width',
  'neck_width',
  'waist_width',
  'hip_width',
]);

const PROPERTY_FOR: Record<string, string> = {
  body_length: 'dimension.body_length',
  chest_width: 'dimension.chest_width',
  shoulder_width: 'dimension.shoulder_width',
  neck_width: 'dimension.neckline_width',
  sleeve_length: 'dimension.sleeve_length',
  cuff_width: 'dimension.cuff_width',
  collar_height: 'dimension.collar_height',
  collar_stand_height: 'dimension.collar_stand_height',
  placket_width: 'dimension.placket_width',
  hem_depth: 'dimension.hem_depth',
  waist_width: 'dimension.waist_width',
  hip_width: 'dimension.hip_width',
  inseam: 'dimension.inseam',
  leg_opening: 'dimension.leg_opening',
  skirt_length: 'dimension.skirt_length',
  waistband_height: 'dimension.waistband_height',
};

export const LABELS: Record<string, string> = {
  body_length: 'body length',
  chest_width: 'chest width',
  shoulder_width: 'shoulder width',
  neck_width: 'neckline width',
  sleeve_length: 'sleeve length',
  sleeve_opening: 'sleeve opening',
  cuff_width: 'cuff width',
  collar_height: 'collar height',
  collar_stand_height: 'collar stand height',
  placket_width: 'placket width',
  hem_depth: 'hem depth',
  waist_width: 'waist width',
  hip_width: 'hip width',
  inseam: 'inseam',
  leg_opening: 'leg opening',
  rise: 'rise',
  skirt_length: 'skirt length',
  waistband_height: 'waistband height',
  hood_height: 'hood height',
};

interface Ctx {
  state: GarmentDesignState;
  component: DesignComponent;
  defaults: Inputs;
  used: Inputs;
  defaulted: string[];
}

/**
 * A measurement for the component: its own value, else the nearest ancestor's (body measurements
 * live on the garment body), else the family default (recorded as defaulted).
 */
function m(ctx: Ctx, name: string): number {
  const key = PROPERTY_FOR[name];
  let c: DesignComponent | undefined = ctx.component;
  for (let hops = 0; c && key && hops < 6; hops++) {
    const v = lengthMm(c.properties[key]);
    if (v !== null && v > 0) {
      ctx.used[name] = v;
      return v;
    }
    const parentId: string | null = c.parentComponentId;
    c = parentId ? ctx.state.components.find((x) => x.componentId === parentId) : undefined;
  }
  // A body measurement anywhere in the design (e.g. chest on the garment body).
  if (key && BODY_MEASUREMENTS.has(name))
    for (const other of ctx.state.components) {
      const v = lengthMm(other.properties[key]);
      if (v !== null && v > 0) {
        ctx.used[name] = v;
        return v;
      }
    }
  const d = ctx.defaults[name] ?? DEFAULTS[FAMILY_FALLBACK]![name] ?? 100;
  ctx.used[name] = d;
  if (!ctx.defaulted.includes(name)) ctx.defaulted.push(name);
  return d;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pt = (x: number, y: number): PatternPoint => ({ x: r1(x), y: r1(y) });

/** Quadratic curve from a to b with control c, as points (excluding a). */
function curve(a: PatternPoint, c: PatternPoint, b: PatternPoint, steps = 8): PatternPoint[] {
  const out: PatternPoint[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push(
      pt(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y),
    );
  }
  return out;
}

interface Shape {
  name: string;
  outline: PatternPoint[];
  grain?: [PatternPoint, PatternPoint];
  fold?: [PatternPoint, PatternPoint];
  notches?: PatternPoint[];
  cut: number;
  mirrored?: boolean;
  fabricRole?: string;
  template: string;
}

function rect(w: number, h: number): PatternPoint[] {
  return [pt(0, 0), pt(w, 0), pt(w, h), pt(0, h)];
}

/** Half bodice on the fold (CF/CB at x = 0). */
function bodice(ctx: Ctx, back: boolean): Shape {
  const length = m(ctx, 'body_length');
  const half = m(ctx, 'chest_width') / 2 + 15;
  const shoulder = m(ctx, 'shoulder_width') / 2;
  const neck = m(ctx, 'neck_width') / 2;
  const neckDepth = back ? 20 : 75;
  const drop = 40;
  const armhole = Math.max(180, length * 0.3);
  const a = pt(0, neckDepth);
  const b = pt(neck, 0);
  const s = pt(shoulder, drop);
  const u = pt(half, armhole + drop);
  const outline = [
    a,
    ...curve(a, pt(neck * 0.9, neckDepth * 0.9), b, 6),
    s,
    ...curve(s, pt(shoulder - 25, armhole * 0.8 + drop), u, 8),
    pt(half, length),
    pt(0, length),
  ];
  return {
    name: back ? 'Back' : 'Front',
    outline,
    fold: [pt(0, neckDepth), pt(0, length)],
    grain: [pt(half * 0.5, length * 0.25), pt(half * 0.5, length * 0.75)],
    notches: [pt(half, armhole + drop + 60)],
    cut: 1,
    template: back ? 'bodice_back' : 'bodice_front',
  };
}

function sleeve(ctx: Ctx): Shape {
  const length = m(ctx, 'sleeve_length');
  const bicep = Math.max(m(ctx, 'chest_width') * 0.36, 160);
  const opening = Math.min(m(ctx, 'sleeve_opening'), bicep * 2);
  const cap = Math.min(150, length * 0.3 + 40);
  const left = pt(0, cap);
  const top = pt(bicep, 0);
  const right = pt(bicep * 2, cap);
  const outline = [
    left,
    ...curve(left, pt(bicep * 0.45, cap * 0.05), top, 8),
    ...curve(top, pt(bicep * 1.55, cap * 0.05), right, 8),
    pt(bicep + opening / 2, cap + length),
    pt(bicep - opening / 2, cap + length),
  ];
  return {
    name: 'Sleeve',
    outline,
    grain: [pt(bicep, cap + 30), pt(bicep, cap + length - 30)],
    notches: [top, pt(bicep * 0.5, cap * 0.45)],
    cut: 2,
    mirrored: true,
    template: 'sleeve',
  };
}

function band(name: string, length: number, height: number, template: string, cut: number): Shape {
  return {
    name,
    outline: rect(length, height * 2),
    fold: [pt(0, height), pt(length, height)],
    grain: [pt(length * 0.2, height), pt(length * 0.8, height)],
    cut,
    template,
  };
}

function collar(ctx: Ctx, stand: boolean): Shape {
  const half = m(ctx, 'neck_width') * 1.25;
  const h = stand ? m(ctx, 'collar_stand_height') : m(ctx, 'collar_height');
  const lift = stand ? 12 : 20;
  const tip = stand ? 0 : 25;
  const a = pt(0, 0);
  const outline = [
    a,
    ...curve(a, pt(half * 0.6, 0), pt(half, -lift), 6),
    pt(half + tip, -lift + h + (stand ? 0 : 10)),
    ...curve(pt(half + tip, -lift + h + 10), pt(half * 0.55, h), pt(0, h), 6),
  ];
  return {
    name: stand ? 'Collar stand' : 'Collar',
    outline,
    fold: [pt(0, 0), pt(0, h)],
    grain: [pt(half * 0.2, h / 2), pt(half * 0.8, h / 2)],
    cut: 2,
    fabricRole: 'main',
    template: stand ? 'collar_stand' : 'collar',
  };
}

function skirtPanel(ctx: Ctx): Shape {
  const waist = m(ctx, 'waist_width') / 2;
  const hip = m(ctx, 'hip_width') / 2;
  const length = m(ctx, 'skirt_length');
  const flare = hip * 0.25;
  return {
    name: 'Skirt panel',
    outline: [
      pt(0, 0),
      pt(waist / 2 + 10, 0),
      pt(hip / 2 + 10, 200),
      pt(hip / 2 + flare, length),
      pt(0, length),
    ],
    fold: [pt(0, 0), pt(0, length)],
    grain: [pt(hip / 5, 80), pt(hip / 5, length - 80)],
    cut: 2,
    template: 'skirt_panel',
  };
}

function legPanel(ctx: Ctx): Shape {
  const waist = m(ctx, 'waist_width') / 2;
  const hip = m(ctx, 'hip_width') / 2;
  const inseam = m(ctx, 'inseam');
  const rise = ctx.defaults['rise'] ?? 280;
  ctx.used['rise'] = rise;
  const opening = m(ctx, 'leg_opening');
  const crotch = hip * 0.18;
  const total = rise + inseam;
  return {
    name: 'Leg',
    outline: [
      pt(crotch, 0),
      pt(crotch + waist / 2 + 15, 0),
      pt(crotch + hip / 2 + 10, rise * 0.7),
      pt(crotch + hip / 2 - 10 + (opening - hip / 2) * 0.3, total),
      pt(crotch + hip / 2 - opening, total),
      pt(0, rise),
      ...curve(pt(0, rise), pt(crotch * 0.9, rise * 0.95), pt(crotch, rise * 0.55), 4),
    ],
    grain: [pt(crotch + hip / 4, rise), pt(crotch + hip / 4, total - 80)],
    notches: [pt(crotch + hip / 2 + 10, rise * 0.7)],
    cut: 2,
    mirrored: true,
    template: 'leg_panel',
  };
}

function hood(ctx: Ctx): Shape {
  const h = m(ctx, 'hood_height');
  const w = h * 0.72;
  const a = pt(0, h);
  return {
    name: 'Hood side',
    outline: [
      a,
      pt(0, 0),
      ...curve(pt(0, 0), pt(w, -20), pt(w, h * 0.55), 8),
      ...curve(pt(w, h * 0.55), pt(w * 0.9, h), pt(w * 0.35, h), 6),
    ],
    grain: [pt(w * 0.4, h * 0.2), pt(w * 0.4, h * 0.8)],
    cut: 2,
    mirrored: true,
    template: 'hood',
  };
}

function shapesFor(ctx: Ctx): Shape[] {
  const c = ctx.component;
  switch (c.componentType) {
    case 'front_body_panel':
      return [bodice(ctx, false)];
    case 'back_body_panel':
      return [bodice(ctx, true)];
    case 'sleeve':
      return c.properties['construction.sleeve_type']?.value === 'sleeveless' ? [] : [sleeve(ctx)];
    case 'cuff': {
      const width = m(ctx, 'cuff_width');
      const around = Math.max(m(ctx, 'sleeve_opening'), 200) + 30;
      return [band('Cuff', around, width, 'cuff', 2)];
    }
    case 'collar':
      return c.properties['construction.collar_type']?.value === 'none' ? [] : [collar(ctx, false)];
    case 'collar_stand':
      return [collar(ctx, true)];
    case 'neckline':
      return [band('Neck band', m(ctx, 'neck_width') * 2.6, 22, 'neck_band', 1)];
    case 'placket': {
      if (c.properties['construction.placket_type']?.value === 'none') return [];
      const length = m(ctx, 'body_length') - 75;
      return [
        {
          name: 'Placket',
          outline: rect(m(ctx, 'placket_width') * 2, length),
          fold: [pt(m(ctx, 'placket_width'), 0), pt(m(ctx, 'placket_width'), length)],
          grain: [pt(m(ctx, 'placket_width'), 40), pt(m(ctx, 'placket_width'), length - 40)],
          cut: 1,
          template: 'placket',
        },
      ];
    }
    case 'pocket': {
      if (c.properties['construction.pocket_type']?.value === 'none') return [];
      const w = 130;
      const h = 150;
      return [
        {
          name: 'Pocket',
          outline: [pt(0, 0), pt(w, 0), pt(w, h - 20), pt(w / 2, h), pt(0, h - 20)],
          grain: [pt(w / 2, 20), pt(w / 2, h - 40)],
          notches: [pt(0, 30), pt(w, 30)],
          cut: 1,
          template: 'patch_pocket',
        },
      ];
    }
    case 'yoke': {
      const w = m(ctx, 'shoulder_width') / 2 + 10;
      return [
        {
          name: 'Yoke',
          outline: [
            pt(0, 20),
            ...curve(
              pt(0, 20),
              pt(m(ctx, 'neck_width') / 2, 18),
              pt(m(ctx, 'neck_width') / 2, 0),
              4,
            ),
            pt(w, 35),
            pt(w, 110),
            pt(0, 110),
          ],
          fold: [pt(0, 20), pt(0, 110)],
          grain: [pt(w * 0.3, 40), pt(w * 0.7, 40)],
          cut: 2,
          template: 'yoke',
        },
      ];
    }
    case 'waistband':
      return [
        band(
          'Waistband',
          m(ctx, 'waist_width') * 2 + 40,
          m(ctx, 'waistband_height'),
          'waistband',
          1,
        ),
      ];
    case 'skirt_panel':
      return [skirtPanel(ctx)];
    case 'leg_panel':
      return [legPanel(ctx)];
    case 'hood':
      return [hood(ctx)];
    case 'hem':
      // A rib band (knits) is its own piece; a turned hem is part of its panel.
      return /rib/i.test(c.displayName)
        ? [band(c.displayName, m(ctx, 'chest_width') * 1.8, m(ctx, 'hem_depth'), 'rib_band', 1)]
        : [];
    default:
      return [];
  }
}

export interface DraftOptions {
  randomBytes?: RandomBytes;
  /** Keep these piece ids for pieces drafted with the same template (redraft keeps identity). */
  previous?: readonly PatternPiece[];
}

/** Drafts the pieces of one component (empty when it has no flat piece of its own). */
export function draftComponentPieces(
  state: GarmentDesignState,
  component: DesignComponent,
  opts: DraftOptions = {},
): PatternPiece[] {
  const ctx: Ctx = {
    state,
    component,
    defaults: DEFAULTS[state.garmentType] ?? DEFAULTS[FAMILY_FALLBACK]!,
    used: {},
    defaulted: [],
  };
  return shapesFor(ctx).map((s) => {
    const previous = opts.previous?.find(
      (p) => p.componentId === component.componentId && p.draft?.template === s.template,
    );
    const notes = [
      'Provisional block drafted from measurements — not a graded production pattern.',
      ...(ctx.defaulted.length
        ? [`Defaults used for: ${ctx.defaulted.map((d) => LABELS[d] ?? d).join(', ')}.`]
        : []),
    ];
    return {
      pieceId: previous?.pieceId ?? createPatternPieceId(opts.randomBytes),
      componentId: component.componentId,
      name: component.displayName,
      outline: s.outline,
      seamAllowanceMm: 10,
      grainline: s.grain ? { from: s.grain[0], to: s.grain[1] } : null,
      foldLine: s.fold ? { from: s.fold[0], to: s.fold[1] } : null,
      notches: s.notches ?? [],
      cutQuantity: s.cut,
      mirrored: s.mirrored ?? false,
      fabricRole: s.fabricRole ?? 'main',
      source: 'generated',
      status: 'provisional',
      draft: { method: 'parametric', template: s.template, inputs: { ...ctx.used } },
      notes,
    } satisfies PatternPiece;
  });
}

/** Drafts every component that has a flat piece. */
export function draftAllPieces(state: GarmentDesignState, opts: DraftOptions = {}): PatternPiece[] {
  return state.components.flatMap((c) => draftComponentPieces(state, c, opts));
}

/**
 * Parametric pieces whose measurements changed since they were drafted (the garment and its
 * patterns must stay in sync — the editor offers "Redraft").
 */
export function outdatedPieces(state: GarmentDesignState): PatternPiece[] {
  const out: PatternPiece[] = [];
  for (const piece of state.patternPieces ?? []) {
    if (piece.draft?.method !== 'parametric') continue;
    const component = state.components.find((c) => c.componentId === piece.componentId);
    if (!component) continue;
    const fresh = draftComponentPieces(state, component).find(
      (p) => p.draft?.template === piece.draft?.template,
    );
    if (!fresh) continue;
    const a = piece.draft.inputs;
    const b = fresh.draft?.inputs ?? {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    if ([...keys].some((k) => Math.abs((a[k] ?? -1) - (b[k] ?? -1)) > 0.5)) out.push(piece);
  }
  return out;
}

/**
 * A piece from an outline in normalized piece coordinates (0–1, e.g. from an uploaded pattern image
 * or an AI description) scaled to estimated dimensions. Always provisional.
 */
export function pieceFromNormalizedOutline(input: {
  componentId: string;
  name: string;
  points: readonly { x: number; y: number }[];
  widthMm: number;
  heightMm: number;
  source: PatternPiece['source'];
  method: 'ai_outline' | 'extracted_outline';
  cutQuantity?: number;
  grainVertical?: boolean;
  notes?: string[];
  randomBytes?: RandomBytes;
}): PatternPiece {
  const outline = input.points.map((p) => pt(p.x * input.widthMm, p.y * input.heightMm));
  const w = input.widthMm;
  const h = input.heightMm;
  return {
    pieceId: createPatternPieceId(input.randomBytes),
    componentId: input.componentId,
    name: input.name,
    outline,
    seamAllowanceMm: 10,
    grainline:
      input.grainVertical === false
        ? { from: pt(w * 0.2, h / 2), to: pt(w * 0.8, h / 2) }
        : { from: pt(w / 2, h * 0.2), to: pt(w / 2, h * 0.8) },
    foldLine: null,
    notches: [],
    cutQuantity: input.cutQuantity ?? 1,
    mirrored: false,
    fabricRole: 'main',
    source: input.source,
    status: 'provisional',
    draft: { method: input.method, template: 'outline', inputs: { width: w, height: h } },
    notes: [
      input.method === 'extracted_outline'
        ? 'Outline read from the uploaded pattern; dimensions are estimates unless the pattern was scaled.'
        : 'Outline estimated by AI from the images; dimensions are estimates.',
      ...(input.notes ?? []),
    ],
  };
}
