import type { GarmentDesignState, PatternSpec } from '@ai-designer/garment-model';
import {
  BODY_LABELS,
  MEASUREMENTS_FOR_FAMILY,
  measurementsFor,
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
  neckline: 'Neckline',
  collar: 'Collar',
  sleeve: 'Sleeve length',
  sleeveStyle: 'Sleeve style',
  cuff: 'Cuff',
  closure: 'Closure',
  waistSeam: 'Waist seam',
  skirt: 'Skirt shape',
  length: 'Length',
  darts: 'Darts',
  pockets: 'Pockets',
  yoke: 'Back yoke',
  leg: 'Leg shape',
  waistband: 'Waistband',
};
const RELEVANT: Record<string, readonly string[]> = {
  dress: [
    'fit',
    'neckline',
    'collar',
    'sleeve',
    'sleeveStyle',
    'cuff',
    'closure',
    'waistSeam',
    'skirt',
    'length',
    'darts',
    'pockets',
  ],
  top: [
    'topType',
    'fit',
    'neckline',
    'collar',
    'sleeve',
    'sleeveStyle',
    'cuff',
    'closure',
    'length',
    'darts',
    'pockets',
    'yoke',
  ],
  skirt: ['fit', 'skirt', 'length', 'closure', 'darts', 'pockets', 'waistband'],
  trousers: ['fit', 'leg', 'length', 'closure', 'pockets', 'waistband'],
};

export interface PatternSection {
  family: string;
  audience: string;
  size: string;
  style: { label: string; value: string }[];
  body: { label: string; valueMm: number; source: 'size chart' | 'edited' }[];
  finished: { label: string; valueMm: number }[];
  checks: SeamCheck[];
  editedPieces: string[];
  seamAllowanceMm: number;
  hemAllowanceMm: number;
}

const human = (v: unknown) =>
  typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v).replaceAll('_', ' ');

export function patternSection(state: GarmentDesignState): PatternSection | null {
  const spec = state.patternSpec as PatternSpec | undefined;
  if (!spec) return null;
  const pieces = state.patternPieces ?? [];
  const chart = measurementsFor(spec.audience, spec.size);
  const ctx = resolve(spec);
  const style = (RELEVANT[spec.family] ?? [])
    .filter((k) => !(spec.style.sleeve === 'none' && (k === 'sleeveStyle' || k === 'cuff')))
    .map((k) => ({
      label: STYLE_LABELS[k] ?? k,
      value: human((spec.style as Record<string, unknown>)[k]),
    }));
  const body = (MEASUREMENTS_FOR_FAMILY[spec.family] ?? []).map((k) => ({
    label: BODY_LABELS[k],
    valueMm: Math.round(spec.body[k] ?? chart[k] ?? 0),
    source: spec.body[k] !== undefined ? ('edited' as const) : ('size chart' as const),
  }));
  const byTemplate = (t: string) => pieces.find((p) => p.draft?.template === t);
  const height = (t: string) => {
    const p = byTemplate(t);
    return p ? pieceDimensions(p).height : null;
  };
  const finished: PatternSection['finished'] = [];
  const add = (label: string, v: number | null | undefined) => {
    if (v && v > 0) finished.push({ label, valueMm: Math.round(v) });
  };
  if (spec.family === 'dress' || spec.family === 'top') {
    add('Bust / chest (finished)', ctx.m.bust + ctx.ease.bust);
    add('Waist (finished)', ctx.m.waist + ctx.ease.waist);
    add(
      'Centre back length',
      height('back') ?? (height('bodice_back') ?? 0) + (height('skirt_back') ?? 0),
    );
    add('Sleeve length (cap to hem)', height('sleeve'));
  }
  if (spec.family === 'dress' && byTemplate('skirt_front'))
    add('Skirt length', height('skirt_front'));
  if (spec.family === 'skirt') {
    add('Waist (finished)', ctx.m.waist + Math.min(ctx.ease.waist, 20));
    add('Hip (finished)', ctx.m.hip + ctx.ease.hip);
    add('Skirt length', height('skirt_front'));
  }
  if (spec.family === 'trousers') {
    add('Hip (finished)', ctx.m.hip + ctx.ease.hip);
    add('Outseam', height('trouser_front'));
  }
  return {
    family: spec.family,
    audience: spec.audience,
    size: spec.size,
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
  return `${label} for ${s.audience}, size ${s.size}. ${s.style.map((x) => `${x.label}: ${x.value}`).join('; ')}. Finished measurements: ${sizes}. Pieces: ${(state.patternPieces ?? []).map((p) => `${p.name} ×${p.cutQuantity}`).join(', ')}.`;
}
