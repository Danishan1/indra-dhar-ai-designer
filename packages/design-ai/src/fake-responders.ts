import type { AiTask, FakeResponder } from '@ai-designer/ai';

/**
 * Deterministic answers for the fake AI provider (tests and demos without keys). They follow the
 * same schemas as real answers and react to the garment hint and image roles in the prompt.
 */

type Part = {
  key: string;
  componentType: string;
  name: string;
  side?: string;
  parentKey?: string | null;
  attributes?: Record<string, string | number>;
  measurementsMm?: Record<string, number>;
  region?: [number, number, number, number];
};

/** Plausible outlines per type, normalized to the region (the fake "traces" these). */
const OUTLINES: Record<string, { x: number; y: number; smooth?: boolean }[]> = {
  garment_body: [
    { x: 0.32, y: 0 },
    { x: 0.68, y: 0 },
    { x: 0.95, y: 0.06 },
    { x: 0.92, y: 0.3, smooth: true },
    { x: 0.95, y: 1 },
    { x: 0.05, y: 1 },
    { x: 0.08, y: 0.3, smooth: true },
    { x: 0.05, y: 0.06 },
  ],
  sleeve: [
    { x: 0.55, y: 0 },
    { x: 1, y: 0.1, smooth: true },
    { x: 0.75, y: 1 },
    { x: 0.2, y: 0.95 },
    { x: 0, y: 0.15 },
  ],
  collar: [
    { x: 0, y: 0.2 },
    { x: 0.5, y: 0.45, smooth: true },
    { x: 1, y: 0.2 },
    { x: 0.85, y: 1 },
    { x: 0.5, y: 0.6, smooth: true },
    { x: 0.15, y: 1 },
  ],
  pocket: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 0.85 },
    { x: 0.5, y: 1 },
    { x: 0, y: 0.85 },
  ],
};
const RECT_OUTLINE = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

const SHIRT: Part[] = [
  {
    key: 'body',
    componentType: 'garment_body',
    name: 'Shirt body',
    parentKey: null,
    measurementsMm: { body_length: 760, chest_width: 560, shoulder_width: 460 },
    region: [0.12, 0.05, 0.76, 0.9],
  },
  { key: 'front', componentType: 'front_body_panel', name: 'Front', region: [0.3, 0.15, 0.4, 0.8] },
  { key: 'back', componentType: 'back_body_panel', name: 'Back' },
  { key: 'yoke', componentType: 'yoke', name: 'Back yoke' },
  {
    key: 'left_sleeve',
    componentType: 'sleeve',
    name: 'Left sleeve',
    side: 'left',
    attributes: { sleeve_type: 'set_in' },
    measurementsMm: { sleeve_length: 620 },
    region: [0.05, 0.18, 0.25, 0.65],
  },
  {
    key: 'right_sleeve',
    componentType: 'sleeve',
    name: 'Right sleeve',
    side: 'right',
    attributes: { sleeve_type: 'set_in' },
    measurementsMm: { sleeve_length: 620 },
    region: [0.7, 0.18, 0.25, 0.65],
  },
  {
    key: 'left_cuff',
    componentType: 'cuff',
    name: 'Left cuff',
    side: 'left',
    parentKey: 'left_sleeve',
    attributes: { cuff_type: 'barrel' },
    measurementsMm: { cuff_width: 65 },
    region: [0.05, 0.75, 0.15, 0.1],
  },
  {
    key: 'right_cuff',
    componentType: 'cuff',
    name: 'Right cuff',
    side: 'right',
    parentKey: 'right_sleeve',
    attributes: { cuff_type: 'barrel' },
    measurementsMm: { cuff_width: 65 },
    region: [0.8, 0.75, 0.15, 0.1],
  },
  {
    key: 'collar',
    componentType: 'collar',
    name: 'Collar',
    attributes: { collar_type: 'spread' },
    measurementsMm: { collar_height: 40 },
    region: [0.38, 0.03, 0.24, 0.1],
  },
  {
    key: 'collar_stand',
    componentType: 'collar_stand',
    name: 'Collar stand',
    parentKey: 'collar',
    measurementsMm: { collar_stand_height: 30 },
  },
  {
    key: 'placket',
    componentType: 'placket',
    name: 'Front placket',
    parentKey: 'front',
    attributes: { placket_type: 'standard', closure_type: 'buttons', button_count: 7 },
    measurementsMm: { placket_width: 32 },
    region: [0.47, 0.12, 0.06, 0.8],
  },
  {
    key: 'pocket',
    componentType: 'pocket',
    name: 'Chest pocket',
    parentKey: 'front',
    attributes: { pocket_type: 'patch', pocket_position: 'left_chest' },
    region: [0.55, 0.28, 0.12, 0.12],
  },
];

const TSHIRT: Part[] = [
  {
    key: 'body',
    componentType: 'garment_body',
    name: 'T-shirt body',
    parentKey: null,
    measurementsMm: { body_length: 700, chest_width: 520 },
    region: [0.1, 0.05, 0.8, 0.9],
  },
  { key: 'front', componentType: 'front_body_panel', name: 'Front' },
  { key: 'back', componentType: 'back_body_panel', name: 'Back' },
  {
    key: 'left_sleeve',
    componentType: 'sleeve',
    name: 'Left sleeve',
    side: 'left',
    attributes: { sleeve_type: 'set_in' },
    measurementsMm: { sleeve_length: 200 },
  },
  {
    key: 'right_sleeve',
    componentType: 'sleeve',
    name: 'Right sleeve',
    side: 'right',
    attributes: { sleeve_type: 'set_in' },
    measurementsMm: { sleeve_length: 200 },
  },
  {
    key: 'neckline',
    componentType: 'neckline',
    name: 'Neck rib',
    attributes: { neckline_type: 'crew' },
  },
  { key: 'hem', componentType: 'hem', name: 'Body hem', attributes: { hem_type: 'coverstitch' } },
];

const DRESS: Part[] = [
  {
    key: 'body',
    componentType: 'garment_body',
    name: 'Dress',
    parentKey: null,
    measurementsMm: { body_length: 1050, chest_width: 450 },
    region: [0.2, 0.03, 0.6, 0.94],
  },
  {
    key: 'bodice_front',
    componentType: 'front_body_panel',
    name: 'Front bodice',
    region: [0.3, 0.1, 0.4, 0.3],
  },
  { key: 'bodice_back', componentType: 'back_body_panel', name: 'Back bodice' },
  {
    key: 'left_sleeve',
    componentType: 'sleeve',
    name: 'Left sleeve',
    side: 'left',
    attributes: { sleeve_type: 'set_in' },
    measurementsMm: { sleeve_length: 250 },
  },
  {
    key: 'right_sleeve',
    componentType: 'sleeve',
    name: 'Right sleeve',
    side: 'right',
    attributes: { sleeve_type: 'set_in' },
    measurementsMm: { sleeve_length: 250 },
  },
  {
    key: 'collar',
    componentType: 'collar',
    name: 'Peter Pan collar',
    attributes: { collar_type: 'peter_pan' },
  },
  {
    key: 'skirt',
    componentType: 'skirt_panel',
    name: 'Gathered skirt',
    measurementsMm: { skirt_length: 620, waist_width: 360 },
    region: [0.2, 0.42, 0.6, 0.55],
  },
  {
    key: 'pocket',
    componentType: 'pocket',
    name: 'Side pocket',
    attributes: { pocket_type: 'welt' },
  },
];

const TROUSERS: Part[] = [
  {
    key: 'body',
    componentType: 'garment_body',
    name: 'Trousers',
    parentKey: null,
    region: [0.2, 0.02, 0.6, 0.96],
  },
  {
    key: 'left_leg',
    componentType: 'leg_panel',
    name: 'Left leg',
    side: 'left',
    measurementsMm: { inseam: 780, leg_opening: 200, hip_width: 520 },
  },
  {
    key: 'right_leg',
    componentType: 'leg_panel',
    name: 'Right leg',
    side: 'right',
    measurementsMm: { inseam: 780, leg_opening: 200, hip_width: 520 },
  },
  {
    key: 'waistband',
    componentType: 'waistband',
    name: 'Waistband',
    attributes: { closure_type: 'buttons' },
    measurementsMm: { waistband_height: 40, waist_width: 400 },
  },
  {
    key: 'pocket_left',
    componentType: 'pocket',
    name: 'Left pocket',
    attributes: { pocket_type: 'welt' },
  },
];

function pick(prompt: string): { category: string; label: string; parts: Part[] } {
  // Only what the user said and file names (the prompt itself lists every category).
  const t = [
    /The user says the garment is: (.*)$/m.exec(prompt)?.[1],
    /User notes: (.*)$/m.exec(prompt)?.[1],
    ...[...prompt.matchAll(/file "([^"]*)"/g)].map((m) => m[1]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/dress|frock/.test(t))
    return { category: 'dress', label: "Girls' Peter Pan collar dress", parts: DRESS };
  if (/trouser|pant|jean/.test(t))
    return { category: 'trousers', label: 'Straight trousers', parts: TROUSERS };
  if (/t-?shirt|tee\b/.test(t))
    return { category: 'knit_tshirt', label: 'Crew-neck T-shirt', parts: TSHIRT };
  return { category: 'woven_shirt', label: "Men's long-sleeve shirt", parts: SHIRT };
}

/** Image roles listed in the prompt ("- Image 2: fabric"). */
function rolesFrom(prompt: string): string[] {
  const out: string[] = [];
  for (const m of prompt.matchAll(/- Image (\d+): ([a-z]+)/g)) out[Number(m[1]) - 1] = m[2]!;
  return out;
}

export const fakeResponders: Partial<Record<AiTask, FakeResponder>> = {
  garment_decomposition: (req) => {
    const { category, label, parts } = pick(req.prompt);
    const roles = rolesFrom(req.prompt);
    const fabricIdx = roles.map((r, i) => (r === 'fabric' ? i : -1)).filter((i) => i >= 0);
    const patternIdx = roles.findIndex((r) => r === 'pattern');
    const designIdx = Math.max(
      0,
      roles.findIndex((r) => r === 'sketch' || r === 'reference' || r === 'role'),
    );
    const fabrics = fabricIdx.map((imageIndex, n) => ({
      key: `fabric_${String.fromCharCode(97 + n)}`,
      imageIndex,
      name: n === 0 ? 'Main fabric' : `Contrast fabric ${n}`,
      color: ['#3b5b8c', '#f5f5f0', '#9b2c2c'][n % 3],
      pattern: n === 0 ? 'solid' : 'stripe',
      texture: 'plain weave',
      likelyMaterial: 'cotton',
      weight: 'medium',
    }));
    return {
      garment: {
        category,
        label,
        audience: category === 'dress' ? 'kids' : 'men',
        silhouette: 'regular',
        description: `A ${label.toLowerCase()} decomposed by the fake analyzer.`,
        confidence: 0.7,
      },
      inputs: roles.map((role, index) => ({
        index,
        role: role === 'role' ? 'sketch' : role,
        notes: '',
      })),
      components: parts.map((p) => ({
        key: p.key,
        componentType: p.componentType,
        name: p.name,
        side: p.side ?? 'none',
        parentKey: p.parentKey === undefined ? 'body' : p.parentKey,
        description: `${p.name} of the ${label.toLowerCase()}`,
        attributes: p.attributes ?? {},
        measurementsMm: p.measurementsMm ?? {},
        measurementSource: 'estimated',
        region: p.region
          ? {
              imageIndex: designIdx,
              x: p.region[0],
              y: p.region[1],
              width: p.region[2],
              height: p.region[3],
            }
          : null,
        outline: p.region ? (OUTLINES[p.componentType] ?? RECT_OUTLINE) : null,
        view: p.region ? 'front' : null,
        details:
          p.componentType === 'placket' && p.region
            ? [0.1, 0.25, 0.4, 0.55, 0.7, 0.85].map((y) => ({
                kind: 'button',
                points: [{ x: 0.5, y }],
              }))
            : [],
        fabricKey: fabrics.length
          ? (p.key === 'collar' || p.key.endsWith('cuff')) && fabrics[1]
            ? fabrics[1].key
            : fabrics[0]!.key
          : null,
        confidence: 0.7,
      })),
      fabrics,
      patternPieces:
        patternIdx >= 0
          ? [
              {
                componentKey:
                  parts.find((p) => p.componentType === 'cuff' || p.componentType === 'waistband')
                    ?.key ?? 'body',
                name: 'Pattern piece from upload',
                imageIndex: patternIdx,
                outline: [
                  { x: 0, y: 0 },
                  { x: 1, y: 0 },
                  { x: 1, y: 1 },
                  { x: 0, y: 1 },
                ],
                widthMm: null,
                heightMm: null,
                cutQuantity: 2,
                markings: ['grainline'],
              },
            ]
          : [],
      missingInformation: [
        'Exact body measurements and size range',
        'Fabric composition and weight',
        'Button size and material',
      ],
    };
  },
  sketch_classify: (req) => fakeClassify(req.prompt),
  fabric_suggest: (req) => fakeFabricSuggestions(req.prompt),
  sketch_details: (req) => fakeDetails(req.prompt),
  component_detail: (req) => ({
    details: [...req.prompt.matchAll(/^- ([a-z0-9_]+): /gm)].map((m) => ({
      key: m[1],
      description: `Refined description of ${m[1]!.replaceAll('_', ' ')}`,
      constructionNotes: [
        'Fuse interfacing where the part needs body',
        'Topstitch 6 mm from the edge',
      ],
      seamAllowanceMm: 10,
    })),
  }),
  techpack_text: () => ({
    description: 'Garment description drafted by the fake provider from the finalized design.',
    constructionSteps: [
      {
        title: 'Cut and fuse',
        details: 'Cut all pieces; fuse interfacing to collar, cuffs and placket.',
        components: [],
      },
      {
        title: 'Assemble body',
        details: 'Join shoulders, set sleeves, close side seams.',
        components: ['Front', 'Back', 'Sleeves'],
      },
      {
        title: 'Finish',
        details: 'Attach collar and cuffs, hem, buttonholes and buttons, press.',
        components: ['Collar', 'Cuffs'],
      },
    ],
    stitching: [{ seam: 'Side seams', stitch: 'Flat-felled seam, 12 SPI', notes: '' }],
    finishing: ['Final press', 'Fold and bag'],
    qualityCheckpoints: [
      'Collar points symmetrical',
      'Cuffs equal width',
      'Buttons aligned with buttonholes',
    ],
    careNotes: ['Machine wash 30 °C', 'Do not tumble dry'],
  }),
};

// ── sketch reading fakes (ADR-061) ───────────────────────────────────────────

function fakeClassify(prompt: string) {
  const hint = (/The user says it is: (.*)\.$/m.exec(prompt)?.[1] ?? '').toLowerCase();
  const forWho = (/It is for: (.*)\.$/m.exec(prompt)?.[1] ?? '').toLowerCase();
  const who = (g: string, age: string, years: number | null) => ({
    gender: /girl|wom/.test(forWho) ? 'female' : /boy|\bm[ae]n\b/.test(forWho) ? 'male' : g,
    ageGroup: /girl|boy/.test(forWho) ? 'child' : /wom|\bm[ae]n\b/.test(forWho) ? 'adult' : age,
    ageYears: years,
  });
  const base = { views: ['front'], confidence: 0.8, description: 'Fake reading for tests.' };
  if (/set|co-?ord|shirt and shorts|half pant/.test(hint))
    return {
      ...base,
      ...who('male', 'child', 8),
      sections: ['upper', 'lower'],
      garments: [
        { type: 'shirt', section: 'upper', label: 'Short-sleeve shirt', confidence: 0.9 },
        { type: 'shorts', section: 'lower', label: 'Shorts with belt loops', confidence: 0.85 },
      ],
      label: "Boys' shirt and shorts set",
    };
  const single = (
    type: string,
    section: string,
    label: string,
    g = 'female',
    age = 'adult',
    years: number | null = null,
  ) => ({
    ...base,
    ...who(g, age, years),
    sections: [section],
    garments: [{ type, section, label, confidence: 0.85 }],
    label,
  });
  if (/hood/.test(hint)) return single('hoodie', 'upper', 'Hoodie', 'unisex');
  if (/blazer/.test(hint)) return single('blazer', 'upper', 'Blazer', 'male');
  if (/jumpsuit|romper/.test(hint))
    return single(/romper/.test(hint) ? 'romper' : 'jumpsuit', 'full', 'Jumpsuit');
  if (/dungaree|overall/.test(hint))
    return single('dungarees', 'full', 'Dungarees', 'male', 'child', 6);
  if (/short/.test(hint)) return single('shorts', 'lower', 'Shorts');
  if (/trouser|pant|jean/.test(hint))
    return single(/jean/.test(hint) ? 'jeans' : 'trousers', 'lower', 'Straight trousers');
  if (/skirt/.test(hint)) return single('skirt', 'lower', 'A-line skirt');
  if (/shirt|top|blouse|tee/.test(hint)) return single('shirt', 'upper', "Men's shirt", 'male');
  return single('dress', 'full', "Girls' puff-sleeve party dress", 'female', 'child', 8);
}

function fakeDetails(prompt: string) {
  const garments = [...prompt.matchAll(/^Garment (\d+) — ([a-z_]+) \(/gm)].map((m) => ({
    index: Number(m[1]),
    type: m[2]!,
  }));
  const STYLES: Record<
    string,
    {
      style: Record<string, unknown>;
      unsure?: string[];
      details?: string[];
      proportions?: Record<string, number | null>;
    }
  > = {
    shirt: {
      style: {
        topType: 'shirt',
        collar: 'shirt',
        closure: 'front_buttons',
        placket: 'separate',
        buttons: 6,
        sleeve: 'short',
        cuff: 'none',
        hemShape: 'straight',
        yoke: true,
        darts: false,
        pockets: 'none',
        fit: 'regular',
      },
      unsure: ['yoke'],
    },
    shorts: {
      style: {
        length: 'above_knee',
        leg: 'straight',
        waistband: true,
        waistbandType: 'fitted',
        beltLoops: 6,
        closure: 'fly_zip',
        pockets: 'slant',
        backPockets: 'patch',
        backPocketCount: 2,
        pleats: 'none',
        turnUps: false,
      },
      unsure: ['backPockets', 'pockets'],
    },
    trousers: {
      style: {
        fit: 'regular',
        leg: 'straight',
        closure: 'fly_zip',
        length: 'full',
        pockets: 'side_seam',
        waistband: true,
        beltLoops: 5,
      },
    },
    jeans: { style: { fit: 'fitted', leg: 'slim', length: 'full' } },
    skirt: { style: { skirt: 'a_line', length: 'knee', closure: 'side_zip', waistband: true } },
    hoodie: { style: { hood: true, ribbing: true, pockets: 'kangaroo', sleeve: 'long' } },
    blazer: {
      style: {
        collar: 'notched',
        closure: 'front_buttons',
        buttons: 2,
        lining: true,
        sleeve: 'long',
        pockets: 'patch',
        pocketCount: 1,
      },
    },
    jumpsuit: {
      style: {
        sleeve: 'none',
        neckline: 'v_neck',
        closure: 'back_zip',
        length: 'full',
        leg: 'wide',
      },
    },
    romper: { style: { sleeve: 'short', closure: 'back_zip', length: 'shorts' } },
    dungarees: { style: { length: 'full', pockets: 'patch' } },
    dress: {
      style: {
        fit: 'regular',
        neckline: 'round',
        collar: 'peter_pan',
        sleeve: 'short',
        sleeveStyle: 'puff',
        cuff: 'band',
        closure: 'back_zip',
        waistSeam: true,
        skirt: 'gathered',
        length: null,
        darts: false,
        pockets: 'none',
      },
      unsure: ['closure'],
      details: ['Bow at the back waist'],
      proportions: { skirtToBodice: 1.5 },
    },
  };
  return {
    garments: garments.map((g) => {
      const s = STYLES[g.type] ?? STYLES['dress']!;
      return {
        index: g.index,
        style: s.style,
        unsure: s.unsure ?? [],
        details: s.details ?? [],
        proportions: s.proportions ?? {},
      };
    }),
    uncertain: ['Back view not shown'],
  };
}

/** Fabric reading and four suggestions (ADR-066); the wearer follows the prompt. */
function fakeFabricSuggestions(prompt: string) {
  const chosen = /made from this fabric for (women|men|girls|boys)\./.exec(prompt)?.[1] ?? null;
  const audience = chosen ?? 'girls';
  return {
    fabric: {
      colors: ['navy', 'white'],
      pattern: 'floral',
      motif: 'small white daisies',
      texture: 'smooth plain weave',
      weight: 'light',
      drape: 'soft',
      stretch: false,
      sheen: 'matte',
      likelyMaterial: 'cotton lawn',
      season: 'spring/summer',
      notes: 'Fake reading for tests.',
    },
    bestFor: chosen
      ? null
      : { audience, why: 'A small, cheerful print in a light cotton suits children.' },
    suggestions: [
      {
        title: 'Tiered sundress',
        garmentType: 'dress',
        audience,
        description: 'A sleeveless dress with two gathered tiers.',
        styleDetails: ['square neckline', 'two gathered tiers', 'back zip'],
        why: 'The soft drape gathers well.',
      },
      {
        title: 'Shirt and shorts set',
        garmentType: 'shirt',
        audience,
        description: 'A camp-collar shirt with matching shorts.',
        styleDetails: ['camp collar', 'short sleeves', 'elastic-waist shorts'],
        why: 'A matching set shows off the print.',
      },
      {
        title: 'A-line skirt',
        garmentType: 'skirt',
        audience,
        description: 'A simple knee-length A-line skirt.',
        styleDetails: ['fitted waistband', 'side zip', 'knee length'],
        why: 'Few seams keep the print unbroken.',
      },
      {
        title: 'Camp-collar shirt',
        garmentType: 'shirt',
        audience,
        description: 'A relaxed short-sleeve shirt.',
        styleDetails: ['camp collar', 'button front', 'chest pocket'],
        why: 'A light cotton is ideal for a summer shirt.',
      },
    ],
  };
}
