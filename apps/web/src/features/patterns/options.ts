import type { PatternFamily, PatternStyle } from '@ai-designer/garment-model';

/** Labels and applicability of the pattern style options (ADR-058). */

export type Unit = 'cm' | 'mm' | 'in';

export function fmt(mm: number, unit: Unit): string {
  if (unit === 'mm') return `${Math.round(mm)}`;
  if (unit === 'in') return (mm / 25.4).toFixed(2);
  return (mm / 10).toFixed(1);
}

export function parseLength(text: string, unit: Unit): number | null {
  const v = Number(text.replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) return null;
  return unit === 'mm' ? v : unit === 'in' ? v * 25.4 : v * 10;
}

export const FAMILY_LABEL: Record<PatternFamily, string> = {
  dress: 'Dress',
  top: 'Top / shirt',
  skirt: 'Skirt',
  trousers: 'Trousers / shorts',
};

export const AUDIENCE_LABEL: Record<string, string> = {
  women: 'Women',
  men: 'Men',
  girls: 'Girls',
  boys: 'Boys',
};

type Field = {
  key: keyof PatternStyle;
  label: string;
  options?: Record<string, string>;
  kind?: 'boolean' | 'number';
  families: readonly PatternFamily[];
  /** Hide unless this predicate holds (e.g. cuff only with sleeves). */
  when?: (s: PatternStyle) => boolean;
};

const ALL: readonly PatternFamily[] = ['dress', 'top', 'skirt', 'trousers'];
const UPPER: readonly PatternFamily[] = ['dress', 'top'];

export const STYLE_FIELDS: readonly Field[] = [
  {
    key: 'topType',
    label: 'Type',
    families: ['top'],
    options: { blouse: 'Blouse', shirt: 'Shirt', tshirt: 'T-shirt (knit)' },
  },
  {
    key: 'fit',
    label: 'Fit',
    families: ALL,
    options: { fitted: 'Fitted', regular: 'Regular', relaxed: 'Relaxed', oversized: 'Oversized' },
  },
  {
    key: 'neckline',
    label: 'Neckline',
    families: UPPER,
    options: {
      round: 'Round',
      crew: 'Crew',
      v_neck: 'V-neck',
      scoop: 'Scoop',
      square: 'Square',
      boat: 'Boat',
    },
    when: (s) => s.collar !== 'shirt' && s.collar !== 'mandarin',
  },
  {
    key: 'collar',
    label: 'Collar',
    families: UPPER,
    options: {
      none: 'None',
      peter_pan: 'Peter Pan',
      shirt: 'Shirt collar + stand',
      mandarin: 'Mandarin',
    },
  },
  {
    key: 'sleeve',
    label: 'Sleeve',
    families: UPPER,
    options: {
      none: 'Sleeveless',
      cap: 'Cap',
      short: 'Short',
      elbow: 'Elbow',
      three_quarter: 'Three-quarter',
      long: 'Long',
    },
  },
  {
    key: 'sleeveStyle',
    label: 'Sleeve style',
    families: UPPER,
    options: {
      fitted: 'Fitted',
      straight: 'Straight',
      puff: 'Puff',
      bishop: 'Bishop',
      flared: 'Flared',
    },
    when: (s) => s.sleeve !== 'none',
  },
  {
    key: 'cuff',
    label: 'Cuff',
    families: UPPER,
    options: { none: 'None', band: 'Band', shirt: 'Shirt cuff' },
    when: (s) => s.sleeve !== 'none' && s.sleeve !== 'cap',
  },
  { key: 'waistSeam', label: 'Waist seam', families: ['dress'], kind: 'boolean' },
  {
    key: 'skirt',
    label: 'Skirt shape',
    families: ['dress', 'skirt'],
    options: {
      straight: 'Straight',
      pencil: 'Pencil',
      a_line: 'A-line',
      flared: 'Flared',
      gathered: 'Gathered',
      half_circle: 'Half circle',
      circle: 'Full circle',
    },
  },
  {
    key: 'leg',
    label: 'Leg',
    families: ['trousers'],
    options: { straight: 'Straight', slim: 'Slim', wide: 'Wide', tapered: 'Tapered' },
  },
  {
    key: 'length',
    label: 'Length',
    families: ALL,
    options: {
      crop: 'Cropped (top)',
      hip: 'Hip',
      tunic: 'Tunic',
      mini: 'Mini',
      above_knee: 'Above knee',
      knee: 'Knee',
      midi: 'Midi',
      ankle: 'Ankle',
      floor: 'Floor',
      shorts: 'Shorts',
      cropped: 'Cropped (trousers)',
      full: 'Full length',
    },
  },
  {
    key: 'closure',
    label: 'Closure',
    families: ALL,
    options: {
      none: 'None / pull-on',
      back_zip: 'Back zip',
      side_zip: 'Side zip',
      front_buttons: 'Front buttons',
      fly_zip: 'Fly zip',
    },
  },
  {
    key: 'pockets',
    label: 'Pockets',
    families: ALL,
    options: { none: 'None', patch: 'Patch pocket', side_seam: 'Side-seam pockets' },
  },
  { key: 'darts', label: 'Darts', families: ['dress', 'top', 'skirt'], kind: 'boolean' },
  { key: 'yoke', label: 'Back yoke', families: ['top'], kind: 'boolean' },
  { key: 'waistband', label: 'Waistband', families: ['skirt', 'trousers'], kind: 'boolean' },
];

const LENGTHS: Record<PatternFamily, readonly string[]> = {
  top: ['crop', 'hip', 'tunic'],
  dress: ['mini', 'above_knee', 'knee', 'midi', 'ankle', 'floor'],
  skirt: ['mini', 'above_knee', 'knee', 'midi', 'ankle', 'floor'],
  trousers: ['shorts', 'knee', 'cropped', 'full'],
};
const CLOSURES: Record<PatternFamily, readonly string[]> = {
  top: ['none', 'back_zip', 'front_buttons'],
  dress: ['none', 'back_zip', 'side_zip', 'front_buttons'],
  skirt: ['none', 'back_zip', 'side_zip'],
  trousers: ['none', 'fly_zip', 'side_zip'],
};
const POCKETS: Record<PatternFamily, readonly string[]> = {
  top: ['none', 'patch'],
  dress: ['none', 'patch', 'side_seam'],
  skirt: ['none', 'side_seam'],
  trousers: ['none', 'side_seam'],
};

/** Fields shown for a family, with the options valid for it. */
export function fieldsFor(family: PatternFamily, style: PatternStyle) {
  return STYLE_FIELDS.filter((f) => f.families.includes(family) && (!f.when || f.when(style))).map(
    (f) => {
      if (!f.options) return f;
      const allowed =
        f.key === 'length'
          ? LENGTHS[family]
          : f.key === 'closure'
            ? CLOSURES[family]
            : f.key === 'pockets'
              ? POCKETS[family]
              : null;
      const options = allowed
        ? Object.fromEntries(Object.entries(f.options).filter(([k]) => allowed.includes(k)))
        : f.options;
      return { ...f, options };
    },
  );
}

export function styleSummary(family: PatternFamily, style: PatternStyle): string[] {
  return fieldsFor(family, style)
    .map((f) => {
      const v = style[f.key];
      if (f.kind === 'boolean') return v ? f.label : null;
      const text = f.options?.[String(v)];
      return text && text !== 'None' ? `${f.label}: ${text}` : null;
    })
    .filter((x): x is string => !!x);
}
