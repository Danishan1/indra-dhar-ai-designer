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
  dress: 'Dress / frock',
  top: 'Top / shirt',
  skirt: 'Skirt',
  trousers: 'Trousers / shorts',
  jumpsuit: 'Jumpsuit / romper',
  jacket: 'Jacket / hoodie',
  dungarees: 'Dungarees',
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
  /** boolean: yes/no · count: 0…max · multi: several of `options`. */
  kind?: 'boolean' | 'count' | 'multi';
  min?: number;
  max?: number;
  families: readonly PatternFamily[];
  /** Hide unless this predicate holds (e.g. cuff only with sleeves). */
  when?: (s: PatternStyle) => boolean;
};

const ALL: readonly PatternFamily[] = [
  'dress',
  'top',
  'skirt',
  'trousers',
  'jumpsuit',
  'jacket',
  'dungarees',
];
const UPPER: readonly PatternFamily[] = ['dress', 'top', 'jacket', 'jumpsuit'];
const LEGS: readonly PatternFamily[] = ['trousers', 'jumpsuit', 'dungarees'];
const BOTTOMS: readonly PatternFamily[] = ['trousers', 'skirt', 'jumpsuit', 'dungarees'];

export const STYLE_FIELDS: readonly Field[] = [
  {
    key: 'topType',
    label: 'Type',
    families: ['top'],
    options: { blouse: 'Blouse', shirt: 'Shirt', tshirt: 'T-shirt (knit)' },
  },
  {
    key: 'jacketType',
    label: 'Type',
    families: ['jacket'],
    options: {
      shirt_jacket: 'Shirt jacket',
      blazer: 'Blazer',
      hoodie: 'Hoodie',
      bomber: 'Bomber',
      sweatshirt: 'Sweatshirt',
    },
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
    when: (s) => !['shirt', 'mandarin', 'camp', 'notched'].includes(s.collar) && !s.hood,
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
      camp: 'Camp (open, no stand)',
      notched: 'Notched lapel',
    },
    when: (s) => !s.hood,
  },
  { key: 'hood', label: 'Hood', families: ['jacket', 'top'], kind: 'boolean' },
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
  {
    key: 'placket',
    label: 'Button placket',
    families: UPPER,
    options: {
      grown_on: 'Grown-on facing',
      separate: 'Separate placket',
      hidden: 'Hidden placket',
    },
    when: (s) => s.closure === 'front_buttons' && s.collar !== 'notched',
  },
  {
    key: 'buttons',
    label: 'Buttons',
    families: UPPER,
    kind: 'count',
    min: 0,
    max: 12,
    when: (s) => s.closure === 'front_buttons',
  },
  {
    key: 'hemShape',
    label: 'Hem',
    families: ['top', 'jacket'],
    options: { auto: 'Automatic', straight: 'Straight', curved: 'Curved (shirt-tail)' },
  },
  {
    key: 'waistSeam',
    label: 'Waist seam',
    families: ['dress'],
    kind: 'boolean',
    when: (s) => !s.yoke,
  },
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
      tiered: 'Tiered',
      pleated: 'Knife pleated',
    },
  },
  {
    key: 'tiers',
    label: 'Tiers',
    families: ['dress', 'skirt'],
    kind: 'count',
    min: 2,
    max: 5,
    when: (s) => s.skirt === 'tiered',
  },
  {
    key: 'leg',
    label: 'Leg',
    families: LEGS,
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
      front_zip: 'Front zip',
      side_buttons: 'Side buttons',
    },
  },
  {
    key: 'pockets',
    label: 'Pockets',
    families: ALL,
    options: {
      none: 'None',
      patch: 'Patch pocket',
      side_seam: 'Side-seam pockets',
      slant: 'Slant pockets',
      scoop: 'Scoop (jeans) pockets',
      kangaroo: 'Kangaroo pocket',
    },
  },
  {
    key: 'pocketCount',
    label: 'Chest pockets',
    families: ['top', 'jacket'],
    kind: 'count',
    min: 1,
    max: 2,
    when: (s) => s.pockets === 'patch',
  },
  {
    key: 'backPockets',
    label: 'Back pockets',
    families: LEGS,
    options: { none: 'None', patch: 'Patch', welt: 'Welt' },
  },
  {
    key: 'backPocketCount',
    label: 'Back pocket count',
    families: LEGS,
    kind: 'count',
    min: 1,
    max: 2,
    when: (s) => s.backPockets !== 'none',
  },
  {
    key: 'cargoPockets',
    label: 'Cargo pockets',
    families: ['trousers', 'jumpsuit'],
    kind: 'boolean',
  },
  {
    key: 'pleats',
    label: 'Front pleats',
    families: ['trousers', 'jumpsuit'],
    options: { none: 'None', single: 'Single', double: 'Double' },
  },
  { key: 'turnUps', label: 'Turn-ups', families: ['trousers'], kind: 'boolean' },
  {
    key: 'darts',
    label: 'Darts',
    families: ['dress', 'top', 'skirt', 'jumpsuit'],
    kind: 'boolean',
  },
  { key: 'yoke', label: 'Yoke', families: ['top', 'dress', 'jacket'], kind: 'boolean' },
  {
    key: 'backPleat',
    label: 'Back pleat',
    families: ['top'],
    kind: 'boolean',
    when: (s) => s.yoke,
  },
  {
    key: 'waistband',
    label: 'Waistband',
    families: ['skirt', 'trousers', 'dungarees'],
    kind: 'boolean',
  },
  {
    key: 'waistbandType',
    label: 'Waistband type',
    families: ['skirt', 'trousers', 'dungarees'],
    options: {
      fitted: 'Fitted (button)',
      elastic: 'Elastic',
      drawstring: 'Drawstring',
      elastic_back: 'Elastic back',
    },
    when: (s) => s.waistband,
  },
  { key: 'beltLoops', label: 'Belt loops', families: BOTTOMS, kind: 'count', min: 0, max: 10 },
  { key: 'lining', label: 'Lining', families: ['jacket', 'skirt', 'dress'], kind: 'boolean' },
  { key: 'ribbing', label: 'Rib bands', families: ['jacket'], kind: 'boolean' },
  { key: 'peplum', label: 'Peplum', families: ['top'], kind: 'boolean' },
  { key: 'wrap', label: 'Wrap front', families: ['dress', 'top', 'skirt'], kind: 'boolean' },
  {
    key: 'ruffles',
    label: 'Ruffles',
    families: ['dress', 'top', 'skirt'],
    kind: 'multi',
    options: { hem: 'Hem', neckline: 'Neckline', sleeve: 'Sleeves' },
  },
];

const LENGTHS: Record<PatternFamily, readonly string[]> = {
  top: ['crop', 'hip', 'tunic'],
  dress: ['mini', 'above_knee', 'knee', 'midi', 'ankle', 'floor'],
  skirt: ['mini', 'above_knee', 'knee', 'midi', 'ankle', 'floor'],
  trousers: ['shorts', 'above_knee', 'knee', 'cropped', 'full'],
  jumpsuit: ['shorts', 'above_knee', 'knee', 'cropped', 'full'],
  jacket: [],
  dungarees: ['shorts', 'above_knee', 'knee', 'cropped', 'full'],
};
const CLOSURES: Record<PatternFamily, readonly string[]> = {
  top: ['none', 'back_zip', 'front_buttons'],
  dress: ['none', 'back_zip', 'side_zip', 'front_buttons'],
  skirt: ['none', 'back_zip', 'side_zip', 'front_buttons'],
  trousers: ['none', 'fly_zip', 'side_zip', 'front_buttons'],
  jumpsuit: ['none', 'back_zip', 'front_buttons', 'front_zip'],
  jacket: ['none', 'front_buttons', 'front_zip'],
  dungarees: ['side_buttons'],
};
const POCKETS: Record<PatternFamily, readonly string[]> = {
  top: ['none', 'patch'],
  dress: ['none', 'patch', 'side_seam'],
  skirt: ['none', 'side_seam', 'patch'],
  trousers: ['none', 'side_seam', 'slant', 'scoop', 'patch'],
  jumpsuit: ['none', 'side_seam', 'slant', 'patch'],
  jacket: ['none', 'patch', 'kangaroo', 'side_seam'],
  dungarees: ['none', 'patch', 'side_seam'],
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
      if (f.kind === 'count') return v ? `${f.label}: ${String(v)}` : null;
      if (f.kind === 'multi')
        return Array.isArray(v) && v.length ? `${f.label}: ${v.join(', ')}` : null;
      const text = f.options?.[String(v)];
      return text && text !== 'None' ? `${f.label}: ${text}` : null;
    })
    .filter((x): x is string => !!x);
}
