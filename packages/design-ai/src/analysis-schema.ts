import { z } from 'zod';

/**
 * What the AI design analyzer returns (ADR-056). Kept tolerant on purpose (models vary): unknown
 * component types fall back to `custom`, unknown categories to `other`, values are clamped; the
 * mapping into the canonical garment state happens in `build-state.ts`.
 */

export const AnalysisCategories = [
  'woven_shirt',
  'knit_tshirt',
  'dress',
  'skirt',
  'trousers',
  'jacket',
  'hoodie',
  'other',
] as const;

export const AnalysisComponentTypes = [
  'garment_body',
  'front_body_panel',
  'back_body_panel',
  'sleeve',
  'cuff',
  'collar',
  'collar_stand',
  'neckline',
  'placket',
  'pocket',
  'waistband',
  'hem',
  'yoke',
  'hood',
  'lining',
  'facing',
  'skirt_panel',
  'leg_panel',
  'custom',
] as const;
export type AnalysisComponentType = (typeof AnalysisComponentTypes)[number];

export const InputRoles = ['sketch', 'reference', 'pattern', 'fabric', 'other'] as const;
export type InputRole = (typeof InputRoles)[number];

const unit = z.coerce.number().min(0).max(1);
const slug = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .transform(
    (s) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 50) || 'part',
  );
const lenient = <T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) =>
  z
    .string()
    .transform((s) =>
      s
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_'),
    )
    .transform((s) => ((values as readonly string[]).includes(s) ? (s as T[number]) : fallback));

export const regionSchema = z.object({
  imageIndex: z.coerce.number().int().min(0),
  x: unit,
  y: unit,
  width: unit,
  height: unit,
});

export const analysisComponentSchema = z.object({
  key: slug,
  componentType: lenient(AnalysisComponentTypes, 'custom'),
  name: z.string().trim().min(1).max(120),
  side: lenient(['left', 'right', 'none'] as const, 'none').default('none'),
  parentKey: slug.nullable().default(null),
  description: z.string().max(1000).default(''),
  /** Construction attributes, e.g. `{ "sleeve_type": "set_in", "cuff_type": "barrel" }`. */
  attributes: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]).transform(String))
    .default({}),
  /** Estimates in millimetres, e.g. `{ "sleeve_length": 620 }`. */
  measurementsMm: z.record(z.string(), z.coerce.number().min(0).max(5000)).default({}),
  measurementSource: lenient(['estimated', 'pattern', 'stated'] as const, 'estimated').default(
    'estimated',
  ),
  region: regionSchema.nullable().default(null),
  fabricKey: z.string().max(60).nullable().default(null),
  confidence: unit.default(0.6),
});
export type AnalysisComponent = z.infer<typeof analysisComponentSchema>;

export const analysisFabricSchema = z.object({
  key: z.string().trim().min(1).max(60),
  imageIndex: z.coerce.number().int().min(0).nullable().default(null),
  name: z.string().trim().min(1).max(120),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .catch(null)
    .default(null),
  pattern: lenient(
    ['solid', 'stripe', 'check', 'print', 'textured', 'other'] as const,
    'other',
  ).default('solid'),
  texture: z.string().max(300).default(''),
  likelyMaterial: z.string().max(120).nullable().default(null),
  weight: lenient(['light', 'medium', 'heavy', 'unknown'] as const, 'unknown').default('unknown'),
  notes: z.string().max(500).default(''),
});
export type AnalysisFabric = z.infer<typeof analysisFabricSchema>;

export const analysisPatternPieceSchema = z.object({
  componentKey: z.string().max(60).nullable().default(null),
  name: z.string().trim().min(1).max(120),
  imageIndex: z.coerce.number().int().min(0).nullable().default(null),
  /** Outline in the piece's own box, 0–1. */
  outline: z
    .array(z.object({ x: unit, y: unit }))
    .min(3)
    .max(200),
  widthMm: z.coerce.number().min(1).max(4000).nullable().default(null),
  heightMm: z.coerce.number().min(1).max(4000).nullable().default(null),
  cutQuantity: z.coerce.number().int().min(1).max(12).default(1),
  markings: z.array(z.string().max(200)).max(20).default([]),
});
export type AnalysisPatternPiece = z.infer<typeof analysisPatternPieceSchema>;

export const decompositionSchema = z.object({
  garment: z.object({
    category: lenient(AnalysisCategories, 'other'),
    label: z.string().trim().min(1).max(160),
    audience: lenient(['men', 'women', 'kids', 'unisex', 'unknown'] as const, 'unknown').default(
      'unknown',
    ),
    silhouette: z.string().max(120).nullable().default(null),
    description: z.string().max(2000).default(''),
    confidence: unit.default(0.6),
  }),
  inputs: z
    .array(
      z.object({
        index: z.coerce.number().int().min(0),
        role: lenient(InputRoles, 'other'),
        notes: z.string().max(500).default(''),
      }),
    )
    .default([]),
  components: z.array(analysisComponentSchema).max(60).default([]),
  fabrics: z.array(analysisFabricSchema).max(12).default([]),
  patternPieces: z.array(analysisPatternPieceSchema).max(40).default([]),
  missingInformation: z.array(z.string().max(300)).max(30).default([]),
});
export type Decomposition = z.infer<typeof decompositionSchema>;

export const componentDetailSchema = z.object({
  details: z
    .array(
      z.object({
        key: slug,
        description: z.string().max(1000).default(''),
        attributes: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]).transform(String))
          .default({}),
        measurementsMm: z.record(z.string(), z.coerce.number().min(0).max(5000)).default({}),
        constructionNotes: z.array(z.string().max(400)).max(12).default([]),
        seamAllowanceMm: z.coerce.number().min(0).max(50).nullable().default(null),
      }),
    )
    .default([]),
});
export type ComponentDetails = z.infer<typeof componentDetailSchema>;

export const techPackTextSchema = z.object({
  description: z.string().max(3000).default(''),
  constructionSteps: z
    .array(
      z.object({
        title: z.string().max(160),
        details: z.string().max(1200).default(''),
        components: z.array(z.string().max(120)).max(12).default([]),
      }),
    )
    .max(30)
    .default([]),
  stitching: z
    .array(
      z.object({
        seam: z.string().max(160),
        stitch: z.string().max(160),
        notes: z.string().max(400).default(''),
      }),
    )
    .max(30)
    .default([]),
  finishing: z.array(z.string().max(300)).max(20).default([]),
  qualityCheckpoints: z.array(z.string().max(300)).max(30).default([]),
  careNotes: z.array(z.string().max(200)).max(12).default([]),
});
export type TechPackText = z.infer<typeof techPackTextSchema>;
