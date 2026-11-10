import type {
  BodyMeasurementKey,
  BodyMeasurements,
  CustomSizeChart,
  PatternAudience,
  PatternSpec,
  SizeSystem,
} from '@ai-designer/garment-model';

/**
 * Standard body measurement charts (ADR-058), millimetres. Approximations of common European
 * charts — a starting point the user edits, never a claim about a specific brand's sizing.
 * `bust` is the chest for men and children.
 */

type Row = readonly number[];
interface Chart {
  sizes: readonly string[];
  rows: Partial<Record<BodyMeasurementKey, Row>>;
}

const WOMEN: Chart = {
  sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  rows: {
    height: [1640, 1660, 1680, 1690, 1700, 1700],
    bust: [820, 860, 920, 980, 1040, 1100],
    waist: [640, 680, 740, 800, 860, 920],
    hip: [880, 920, 980, 1040, 1100, 1160],
    neck: [340, 350, 360, 370, 380, 390],
    shoulder: [115, 118, 121, 124, 127, 130],
    across_back: [320, 330, 345, 360, 375, 390],
    back_length: [400, 405, 410, 415, 420, 425],
    front_length: [440, 448, 457, 466, 475, 485],
    bust_depth: [245, 252, 260, 268, 276, 284],
    bust_span: [170, 175, 180, 186, 192, 198],
    armhole_depth: [195, 200, 205, 212, 219, 226],
    arm_length: [575, 580, 585, 590, 595, 600],
    upper_arm: [260, 275, 290, 310, 330, 350],
    wrist: [150, 155, 160, 165, 170, 175],
    waist_to_hip: [200, 203, 206, 209, 212, 215],
    waist_to_knee: [570, 575, 580, 585, 590, 595],
    waist_to_floor: [1020, 1030, 1040, 1050, 1060, 1070],
    crotch_depth: [255, 260, 268, 276, 284, 292],
    thigh: [520, 545, 575, 605, 635, 665],
    knee: [340, 350, 365, 380, 395, 410],
    ankle: [220, 225, 230, 235, 240, 245],
  },
};

const MEN: Chart = {
  sizes: ['S', 'M', 'L', 'XL', 'XXL', '3XL'],
  rows: {
    height: [1760, 1780, 1800, 1820, 1840, 1860],
    bust: [920, 980, 1040, 1100, 1160, 1220],
    waist: [780, 840, 900, 960, 1020, 1080],
    hip: [940, 990, 1040, 1090, 1140, 1190],
    neck: [370, 385, 400, 415, 430, 445],
    shoulder: [145, 150, 155, 160, 165, 170],
    across_back: [370, 385, 400, 415, 430, 445],
    back_length: [440, 445, 450, 455, 460, 465],
    front_length: [445, 450, 455, 460, 465, 470],
    bust_depth: [265, 270, 275, 280, 285, 290],
    bust_span: [190, 195, 200, 205, 210, 215],
    armhole_depth: [225, 232, 240, 248, 256, 264],
    arm_length: [620, 630, 640, 650, 660, 665],
    upper_arm: [300, 315, 330, 345, 360, 375],
    wrist: [170, 175, 180, 185, 190, 195],
    waist_to_hip: [200, 203, 206, 209, 212, 215],
    waist_to_knee: [590, 595, 600, 605, 610, 615],
    waist_to_floor: [1050, 1070, 1090, 1100, 1110, 1120],
    crotch_depth: [265, 272, 280, 288, 296, 304],
    thigh: [550, 580, 610, 640, 670, 700],
    knee: [380, 395, 410, 425, 440, 455],
    ankle: [240, 245, 250, 255, 260, 265],
  },
};

const KIDS: Chart = {
  sizes: ['2y', '4y', '6y', '8y', '10y', '12y', '14y'],
  rows: {
    height: [920, 1040, 1160, 1280, 1400, 1520, 1620],
    bust: [530, 560, 600, 640, 690, 750, 800],
    waist: [510, 530, 550, 580, 610, 640, 660],
    hip: [540, 580, 630, 680, 740, 800, 860],
    neck: [270, 280, 290, 300, 310, 320, 330],
    shoulder: [75, 82, 89, 96, 103, 110, 115],
    across_back: [230, 245, 260, 275, 290, 305, 320],
    back_length: [230, 255, 280, 300, 320, 345, 370],
    front_length: [235, 260, 285, 305, 327, 357, 385],
    bust_depth: [150, 165, 180, 195, 210, 225, 240],
    bust_span: [120, 128, 136, 144, 152, 160, 168],
    armhole_depth: [120, 130, 140, 150, 162, 175, 185],
    arm_length: [330, 370, 410, 450, 490, 530, 560],
    upper_arm: [180, 190, 200, 212, 225, 240, 255],
    wrist: [120, 125, 130, 135, 140, 145, 150],
    waist_to_hip: [110, 120, 135, 150, 165, 180, 190],
    waist_to_knee: [290, 330, 370, 410, 450, 490, 530],
    waist_to_floor: [520, 600, 690, 780, 870, 950, 1000],
    crotch_depth: [160, 175, 190, 200, 215, 230, 245],
    thigh: [320, 345, 375, 405, 440, 475, 510],
    knee: [230, 245, 265, 285, 305, 320, 335],
    ankle: [160, 170, 180, 190, 200, 210, 220],
  },
};

const CHARTS: Record<PatternAudience, Chart> = {
  women: WOMEN,
  men: MEN,
  girls: KIDS,
  boys: KIDS,
};

export const DEFAULT_SIZE: Record<PatternAudience, string> = {
  women: 'M',
  men: 'L',
  girls: '6y',
  boys: '6y',
};

// ── size standards (ADR-067) ───────────────────────────────────────────────
//
// One body chart per audience (above) carries every measurement. A standard only says what its
// sizes are and their defining measurements — bust/chest, waist and hip for adults, height for
// children; the other measurements follow the body chart (interpolated on bust or height).
// Approximations of common national charts, a starting point to edit — never a brand's sizing.

/** Defining measurements of a size (mm). */
interface StdSize {
  label: string;
  bust?: number;
  waist?: number;
  hip?: number;
  height?: number;
}

const cm = (v: number) => Math.round(v * 10);
const women = (label: string, b: number, w: number, h: number): StdSize => ({
  label,
  bust: cm(b),
  waist: cm(w),
  hip: cm(h),
});
// UK women 4–22; US = UK − 4; EU = UK + 28 (same bodies, different labels).
const UK_WOMEN: [number, number, number, number][] = [
  [4, 76, 58, 82],
  [6, 78, 60, 84],
  [8, 82, 64, 88],
  [10, 86, 68, 92],
  [12, 91, 73, 97],
  [14, 96, 78, 102],
  [16, 101, 83, 107],
  [18, 108, 90, 114],
  [20, 115, 97, 121],
  [22, 122, 104, 128],
];
// Men: UK and US label by chest in inches (34–48); EU by half the chest in cm (44–58).
const menByChestMm = (label: string, chest: number): StdSize => ({
  label,
  bust: Math.round(chest),
  waist: Math.round(chest - 140),
  hip: Math.round(chest + 20),
});
const MEN_INCH = [34, 36, 38, 40, 42, 44, 46, 48].map((i) => menByChestMm(String(i), i * 25.4));
// Children: UK by age range, EU by height (cm), US toddler + numeric — all anchored on height.
const KID_HEIGHTS = [92, 98, 104, 110, 116, 122, 128, 134, 140, 146, 152, 158, 164];
const kid = (label: string, h: number): StdSize => ({ label, height: cm(h) });

const STANDARDS: Record<
  Exclude<SizeSystem, 'intl' | 'custom'>,
  Record<PatternAudience, StdSize[]>
> = {
  uk: {
    women: UK_WOMEN.map(([n, b, w, h]) => women(String(n), b, w, h)),
    men: MEN_INCH,
    girls: KID_HEIGHTS.slice(1).map((h, i) => kid(`${i + 2}-${i + 3}y`, h)),
    boys: KID_HEIGHTS.slice(1).map((h, i) => kid(`${i + 2}-${i + 3}y`, h)),
  },
  us: {
    women: UK_WOMEN.map(([n, b, w, h]) => women(String(n - 4), b, w, h)),
    men: MEN_INCH,
    girls: usKids(),
    boys: usKids(),
  },
  eu: {
    women: UK_WOMEN.map(([n, b, w, h]) => women(String(n + 28), b, w, h)),
    men: [44, 46, 48, 50, 52, 54, 56, 58].map((n) => menByChestMm(String(n), n * 20)),
    girls: KID_HEIGHTS.map((h) => kid(String(h), h)),
    boys: KID_HEIGHTS.map((h) => kid(String(h), h)),
  },
};

function usKids(): StdSize[] {
  return [
    kid('2T', 92),
    kid('3T', 98),
    kid('4T', 104),
    kid('5', 110),
    kid('6', 116),
    kid('7', 122),
    kid('8', 128),
    kid('10', 140),
    kid('12', 152),
    kid('14', 158),
    kid('16', 164),
  ];
}

export const SIZE_SYSTEM_LABELS: Record<SizeSystem, string> = {
  intl: 'International',
  uk: 'UK',
  us: 'US',
  eu: 'EU',
  custom: 'Custom',
};

const DEFAULTS: Record<Exclude<SizeSystem, 'custom'>, Record<PatternAudience, string>> = {
  intl: DEFAULT_SIZE,
  uk: { women: '12', men: '40', girls: '6-7y', boys: '6-7y' },
  us: { women: '8', men: '40', girls: '6', boys: '6' },
  eu: { women: '40', men: '50', girls: '122', boys: '122' },
};

const kids = (a: PatternAudience) => a === 'girls' || a === 'boys';

/** Size labels of a standard for an audience (a custom chart lists its own). */
export function sizesFor(
  audience: PatternAudience,
  system: SizeSystem = 'intl',
  custom?: CustomSizeChart | null,
): readonly string[] {
  if (system === 'custom') return custom?.sizes.map((s) => s.label) ?? CHARTS[audience].sizes;
  if (system === 'intl') return CHARTS[audience].sizes;
  return STANDARDS[system][audience].map((s) => s.label);
}

/** The default size of a standard (the first of a custom chart's middle sizes). */
export function defaultSizeFor(
  audience: PatternAudience,
  system: SizeSystem = 'intl',
  custom?: CustomSizeChart | null,
): string {
  if (system === 'custom') {
    const s = custom?.sizes ?? [];
    return s[Math.floor((s.length - 1) / 2)]?.label ?? DEFAULT_SIZE[audience];
  }
  return DEFAULTS[system][audience];
}

/** Every body chart measurement at a given bust (adults) or height (children), interpolated. */
function chartAt(audience: PatternAudience, anchor: number): BodyMeasurements {
  const chart = CHARTS[audience];
  const key: BodyMeasurementKey = kids(audience) ? 'height' : 'bust';
  const axis = chart.rows[key]!;
  let i = 0;
  while (i < axis.length - 2 && anchor > axis[i + 1]!) i++;
  const t = (anchor - axis[i]!) / (axis[i + 1]! - axis[i]!);
  const out: BodyMeasurements = {};
  for (const [k, row] of Object.entries(chart.rows))
    out[k as BodyMeasurementKey] = Math.round(row[i]! + t * (row[i + 1]! - row[i]!));
  return out;
}

/**
 * Every body measurement of a size (mm). Unknown sizes fall back to the standard's default size.
 * `intl` sizes are the body chart's own columns; national sizes set their defining measurements
 * and take the rest from the chart; custom sizes use the chart's values over the same base.
 */
export function measurementsFor(
  audience: PatternAudience,
  size: string,
  system: SizeSystem = 'intl',
  custom?: CustomSizeChart | null,
): BodyMeasurements {
  if (system === 'intl' || (system === 'custom' && !custom)) {
    const chart = CHARTS[audience];
    let i = chart.sizes.indexOf(size);
    if (i < 0) i = chart.sizes.indexOf(DEFAULT_SIZE[audience]);
    const out: BodyMeasurements = {};
    for (const [k, row] of Object.entries(chart.rows)) out[k as BodyMeasurementKey] = row[i]!;
    return out;
  }
  if (system === 'custom') {
    const row =
      custom!.sizes.find((s) => s.label === size) ??
      custom!.sizes[Math.floor((custom!.sizes.length - 1) / 2)]!;
    const anchorKey: BodyMeasurementKey = kids(audience) ? 'height' : 'bust';
    const base =
      row.body[anchorKey] !== undefined
        ? chartAt(audience, row.body[anchorKey]!)
        : measurementsFor(audience, DEFAULT_SIZE[audience]);
    return { ...base, ...row.body };
  }
  const table = STANDARDS[system][audience];
  const std =
    table.find((s) => s.label === size) ??
    table.find((s) => s.label === DEFAULTS[system][audience])!;
  const anchor = kids(audience) ? std.height! : std.bust!;
  const out = chartAt(audience, anchor);
  for (const k of ['bust', 'waist', 'hip', 'height'] as const)
    if (std[k] !== undefined) out[k] = std[k];
  return out;
}

/** Body measurements of a spec's size (its standard and custom chart). */
export function specMeasurements(spec: {
  audience: PatternAudience;
  size: string;
  sizeSystem?: SizeSystem;
  customChart?: CustomSizeChart | undefined;
}): BodyMeasurements {
  return measurementsFor(spec.audience, spec.size, spec.sizeSystem ?? 'intl', spec.customChart);
}

/**
 * The nearest size in another standard (by bust for adults, height for children) — used when the
 * user switches the standard so the garment keeps about the same size.
 */
export function convertSize(
  audience: PatternAudience,
  from: { system: SizeSystem; size: string; custom?: CustomSizeChart | null },
  to: { system: SizeSystem; custom?: CustomSizeChart | null },
): string {
  const key: BodyMeasurementKey = kids(audience) ? 'height' : 'bust';
  const target = measurementsFor(audience, from.size, from.system, from.custom)[key] ?? 0;
  let best = defaultSizeFor(audience, to.system, to.custom);
  let bd = Infinity;
  for (const s of sizesFor(audience, to.system, to.custom)) {
    const v = measurementsFor(audience, s, to.system, to.custom)[key] ?? 0;
    if (Math.abs(v - target) < bd) {
      bd = Math.abs(v - target);
      best = s;
    }
  }
  return best;
}

/** "UK 12", "US 6", "EU 40", "M", "Brand boys · 8". */
export function sizeLabel(spec: {
  size: string;
  sizeSystem?: SizeSystem;
  customChart?: { name: string } | undefined;
}): string {
  const system = spec.sizeSystem ?? 'intl';
  if (system === 'intl') return spec.size;
  if (system === 'custom') return `${spec.customChart?.name ?? 'Custom'} · ${spec.size}`;
  return `${SIZE_SYSTEM_LABELS[system]} ${spec.size}`;
}

/** Human labels for the measurement table. */
export const BODY_LABELS: Record<BodyMeasurementKey, string> = {
  height: 'Height',
  bust: 'Bust / chest',
  waist: 'Waist',
  hip: 'Hip',
  neck: 'Neck',
  shoulder: 'Shoulder length',
  across_back: 'Across back',
  back_length: 'Nape to waist',
  front_length: 'Neck point to waist (front)',
  bust_depth: 'Neck point to bust point',
  bust_span: 'Bust point to bust point',
  armhole_depth: 'Nape to underarm',
  arm_length: 'Arm length (shoulder to wrist)',
  upper_arm: 'Upper arm',
  wrist: 'Wrist',
  waist_to_hip: 'Waist to hip',
  waist_to_knee: 'Waist to knee',
  waist_to_floor: 'Waist to floor',
  crotch_depth: 'Body rise (crotch depth)',
  thigh: 'Thigh',
  knee: 'Knee',
  ankle: 'Ankle',
};

/** Measurements each family actually uses (shown in the editor). */
export const MEASUREMENTS_FOR_FAMILY: Record<string, readonly BodyMeasurementKey[]> = {
  dress: [
    'bust',
    'waist',
    'hip',
    'neck',
    'shoulder',
    'across_back',
    'back_length',
    'front_length',
    'bust_depth',
    'bust_span',
    'armhole_depth',
    'arm_length',
    'upper_arm',
    'wrist',
    'waist_to_hip',
    'waist_to_knee',
    'waist_to_floor',
  ],
  top: [
    'bust',
    'waist',
    'hip',
    'neck',
    'shoulder',
    'across_back',
    'back_length',
    'front_length',
    'bust_depth',
    'bust_span',
    'armhole_depth',
    'arm_length',
    'upper_arm',
    'wrist',
    'waist_to_hip',
  ],
  skirt: ['waist', 'hip', 'waist_to_hip', 'waist_to_knee', 'waist_to_floor'],
  trousers: [
    'waist',
    'hip',
    'waist_to_hip',
    'crotch_depth',
    'waist_to_knee',
    'waist_to_floor',
    'thigh',
    'knee',
    'ankle',
  ],
};
// Families added in ADR-061 reuse the lists above.
const MFF = MEASUREMENTS_FOR_FAMILY as Record<string, readonly BodyMeasurementKey[]>;
MFF['jacket'] = MFF['top']!;
MFF['jumpsuit'] = [...new Set([...MFF['top']!, ...MFF['trousers']!])];
MFF['dungarees'] = [
  ...new Set([...MFF['trousers']!, 'bust', 'back_length'] as BodyMeasurementKey[]),
];

/** Measurements a spec uses (every garment of a set). */
export function measurementsForSpec(spec: {
  family: string;
  garments?: readonly { family: string }[];
}): BodyMeasurementKey[] {
  const fams = [spec.family, ...(spec.garments ?? []).map((g) => g.family)];
  return [...new Set(fams.flatMap((f) => [...(MFF[f] ?? [])]))];
}

/** Kids' chart size for an age in years (nearest size). */
export function kidsSizeForAge(age: number): string {
  const sizes = KIDS.sizes.map((s) => [s, parseInt(s, 10)] as const);
  let best = sizes[0]![0];
  let bd = Infinity;
  for (const [s, a] of sizes)
    if (Math.abs(a - age) < bd) {
      bd = Math.abs(a - age);
      best = s;
    }
  return best;
}

/**
 * The same design in another size of its standard (grading for the tech pack size chart): the
 * chart values change and every measurement the designer changed keeps its difference from the
 * chart (a 2 cm longer back stays 2 cm longer in every size).
 */
export function specForSize(spec: PatternSpec, size: string): PatternSpec {
  const base = specMeasurements(spec);
  const next = specMeasurements({ ...spec, size });
  const body: BodyMeasurements = {};
  for (const [k, v] of Object.entries(spec.body) as [BodyMeasurementKey, number][])
    body[k] = Math.max(1, Math.round(v + (next[k] ?? 0) - (base[k] ?? 0)));
  return { ...spec, size, body };
}
