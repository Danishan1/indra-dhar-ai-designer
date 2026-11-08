import {
  type GarmentDesignState,
  garmentSpec,
  garmentsOf,
  type PatternSpec,
  patternSpecSchema,
} from '@ai-designer/garment-model';
import {
  BODY_LABELS,
  garmentName,
  measurementsFor,
  measurementsForSpec,
  pieceDimensions,
  resolve,
  type SeamCheck,
  seamChecks,
} from '@ai-designer/pattern-model';

/**
 * Component 3 (ADR-058): the tech pack of a pattern-first design is built from its patterns — the
 * drafting spec, the body measurements, the finished garment measurements read off the pieces and
 * the seam checks. Images are generated from this description (and the sketch as a look reference).
 */

const STYLE_LABELS: Record<string, string> = {
  fit: 'Fit',
  topType: 'Type',
  jacketType: 'Type',
  neckline: 'Neckline',
  collar: 'Collar',
  sleeve: 'Sleeve length',
  sleeveStyle: 'Sleeve style',
  cuff: 'Cuff',
  closure: 'Closure',
  placket: 'Placket',
  hemShape: 'Hem',
  waistSeam: 'Waist seam',
  skirt: 'Skirt shape',
  length: 'Length',
  darts: 'Darts',
  pockets: 'Pockets',
  backPockets: 'Back pockets',
  cargoPockets: 'Cargo pockets',
  yoke: 'Yoke',
  backPleat: 'Back pleat',
  leg: 'Leg shape',
  waistband: 'Waistband',
  waistbandType: 'Waistband type',
  beltLoops: 'Belt loops',
  pleats: 'Pleats',
  turnUps: 'Turn-ups',
  hood: 'Hood',
  lining: 'Lining',
  ribbing: 'Rib bands',
  peplum: 'Peplum',
  wrap: 'Wrap front',
  ruffles: 'Ruffles',
};
const UPPER = ['fit', 'neckline', 'collar', 'sleeve', 'sleeveStyle', 'cuff', 'closure', 'placket'];
const BOTTOM = [
  'fit',
  'leg',
  'length',
  'closure',
  'waistband',
  'waistbandType',
  'beltLoops',
  'pockets',
  'backPockets',
  'cargoPockets',
  'pleats',
  'turnUps',
];
const RELEVANT: Record<string, readonly string[]> = {
  dress: [...UPPER, 'waistSeam', 'yoke', 'skirt', 'length', 'darts', 'pockets', 'wrap', 'ruffles'],
  top: [
    'topType',
    ...UPPER,
    'length',
    'hemShape',
    'darts',
    'pockets',
    'yoke',
    'backPleat',
    'peplum',
    'wrap',
    'ruffles',
  ],
  jacket: ['jacketType', ...UPPER, 'hemShape', 'pockets', 'hood', 'lining', 'ribbing'],
  skirt: [
    'fit',
    'skirt',
    'length',
    'closure',
    'waistband',
    'waistbandType',
    'beltLoops',
    'darts',
    'pockets',
    'wrap',
    'ruffles',
  ],
  trousers: BOTTOM,
  jumpsuit: [...UPPER, 'leg', 'length', 'pockets', 'backPockets', 'beltLoops', 'darts'],
  dungarees: ['leg', 'length', 'pockets', 'backPockets', 'waistband'],
};

export interface PatternSection {
  family: string;
  audience: string;
  size: string;
  /** Garments of the design (one unless it is a co-ord set). */
  garments: { key: string; name: string; family: string }[];
  style: { label: string; value: string }[];
  body: { label: string; valueMm: number; source: 'size chart' | 'edited' }[];
  finished: { label: string; valueMm: number }[];
  checks: SeamCheck[];
  editedPieces: string[];
  seamAllowanceMm: number;
  hemAllowanceMm: number;
}

const human = (v: unknown) =>
  typeof v === 'boolean'
    ? v
      ? 'yes'
      : 'no'
    : Array.isArray(v)
      ? v.length
        ? v.join(', ').replaceAll('_', ' ')
        : 'none'
      : String(v).replaceAll('_', ' ');

export function patternSection(state: GarmentDesignState): PatternSection | null {
  const raw = state.patternSpec as PatternSpec | undefined;
  if (!raw) return null;
  const spec = patternSpecSchema.parse(raw);
  const pieces = state.patternPieces ?? [];
  const chart = measurementsFor(spec.audience, spec.size);
  const set = spec.garments.length > 0;
  const garments = garmentsOf(spec).map((g) => ({
    key: g.key,
    name: garmentName(garmentSpec(spec, g.key)),
    family: g.family,
  }));
  const style: PatternSection['style'] = [];
  const finished: PatternSection['finished'] = [];
  for (const g of garments) {
    const gs = garmentSpec(spec, g.key);
    const label = (l: string) => (set ? `${g.name} · ${l}` : l);
    for (const k of RELEVANT[gs.family] ?? []) {
      if (gs.style.sleeve === 'none' && (k === 'sleeveStyle' || k === 'cuff')) continue;
      if (k === 'waistbandType' && !gs.style.waistband) continue;
      if (k === 'placket' && gs.style.closure !== 'front_buttons') continue;
      style.push({
        label: label(STYLE_LABELS[k] ?? k),
        value: human((gs.style as Record<string, unknown>)[k]),
      });
    }
    const pre = g.key === 'main' ? '' : `${g.key}.`;
    const byTemplate = (t: string) => pieces.find((p) => p.draft?.template === pre + t);
    const height = (t: string) => {
      const p = byTemplate(t);
      return p ? pieceDimensions(p).height : null;
    };
    const ctx = resolve(gs);
    const add = (l: string, v: number | null | undefined) => {
      if (v && v > 0) finished.push({ label: label(l), valueMm: Math.round(v) });
    };
    const fam = gs.family;
    if (fam === 'dress' || fam === 'top' || fam === 'jacket' || fam === 'jumpsuit') {
      add('Bust / chest (finished)', ctx.m.bust + ctx.ease.bust);
      if (fam !== 'jacket') add('Waist (finished)', ctx.m.waist + ctx.ease.waist);
      add(
        'Centre back length',
        height('back') ??
          (height('bodice_back') ?? (height('yoke_back') ?? 0) + (height('frock_back') ?? 0)) +
            (height('skirt_back') ?? 0),
      );
      add('Sleeve length (cap to hem)', height('sleeve'));
    }
    if (fam === 'dress' && byTemplate('skirt_front')) add('Skirt length', height('skirt_front'));
    if (fam === 'skirt') {
      add('Waist (finished)', ctx.m.waist + Math.min(ctx.ease.waist, 20));
      add('Hip (finished)', ctx.m.hip + ctx.ease.hip);
      add('Skirt length', height('skirt_front'));
    }
    if (fam === 'trousers' || fam === 'jumpsuit' || fam === 'dungarees') {
      add('Hip (finished)', ctx.m.hip + ctx.ease.hip);
      add('Outseam', height('trouser_front'));
    }
  }
  const body = measurementsForSpec(spec).map((k) => ({
    label: BODY_LABELS[k],
    valueMm: Math.round(spec.body[k] ?? chart[k] ?? 0),
    source: spec.body[k] !== undefined ? ('edited' as const) : ('size chart' as const),
  }));
  return {
    family: set ? 'set' : spec.family,
    audience: spec.audience,
    size: spec.size,
    garments,
    style,
    body,
    finished,
    checks: seamChecks(pieces, spec),
    editedPieces: pieces.filter((p) => p.source === 'user').map((p) => p.name),
    seamAllowanceMm: spec.seamAllowanceMm,
    hemAllowanceMm: spec.hemAllowanceMm,
  };
}

/** Text description of the garment sewn from the patterns (image prompts, AI text). */
export function patternDescription(state: GarmentDesignState): string | null {
  const s = patternSection(state);
  if (!s) return null;
  const meta = state.metadata as Record<string, unknown>;
  const label = typeof meta['garmentLabel'] === 'string' ? meta['garmentLabel'] : s.family;
  const sizes = s.finished
    .map((f) => `${f.label.toLowerCase()} ${Math.round(f.valueMm / 10)} cm`)
    .join(', ');
  const set =
    s.garments.length > 1
      ? ` A co-ord set of ${s.garments.length} garments: ${s.garments.map((g) => g.name).join(' and ')}.`
      : '';
  return `${label} for ${s.audience}, size ${s.size}.${set} ${s.style.map((x) => `${x.label}: ${x.value}`).join('; ')}. Finished measurements: ${sizes}. Pieces: ${(state.patternPieces ?? []).map((p) => `${p.name} ×${p.cutQuantity}`).join(', ')}.`;
}
