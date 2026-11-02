import { z } from 'zod';

/**
 * Editable reconstruction geometry of a component (ADR-057): the AI rebuilds the garment as
 * vector artifacts, not crops. A shape is a closed path normalized to its box (0–1, so changing
 * the box width/height resizes it), placed in the garment frame in millimetres (x right, y down)
 * for one view. Points may carry cubic handles (`c1` before / `c2` after the point, also
 * normalized) for curves. Details (stitch lines, buttons, fold lines) live inside the same box.
 *
 * `source` + `confidence` keep AI interpretation apart from what a person drew or confirmed.
 */

const unitPoint = z.object({ x: z.number().min(-1).max(2), y: z.number().min(-1).max(2) });

export const shapePointSchema = unitPoint.extend({
  c1: unitPoint.optional(),
  c2: unitPoint.optional(),
});
export type ShapePoint = z.infer<typeof shapePointSchema>;

export const ShapeSources = ['observed', 'inferred', 'template', 'library', 'user'] as const;
export const shapeSourceSchema = z.enum(ShapeSources);
export type ShapeSource = z.infer<typeof shapeSourceSchema>;

export const ShapeDetailKinds = ['stitch', 'line', 'fold', 'button', 'buttonhole', 'dart'] as const;

export const componentShapeSchema = z.object({
  view: z.enum(['front', 'back']),
  /** Box in the garment frame (mm). */
  x: z.number().finite().min(-5000).max(5000),
  y: z.number().finite().min(-5000).max(5000),
  width: z.number().finite().min(1).max(5000),
  height: z.number().finite().min(1).max(5000),
  /** Degrees, clockwise, around the box centre. */
  rotation: z.number().finite().min(-360).max(360).default(0),
  /** Closed outline normalized to the box. */
  path: z.array(shapePointSchema).min(3).max(240),
  /** Higher draws on top. */
  layer: z.number().int().min(-100).max(100).default(0),
  style: z
    .object({
      fill: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .nullable()
        .default(null),
      stroke: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .default('#1f2937'),
      opacity: z.number().min(0).max(1).default(1),
    })
    .default({ fill: null, stroke: '#1f2937', opacity: 1 }),
  details: z
    .array(
      z.object({
        kind: z.enum(ShapeDetailKinds),
        points: z.array(unitPoint).min(1).max(120),
      }),
    )
    .max(40)
    .default([]),
  source: shapeSourceSchema,
  /** 0–1 for AI interpretation; null when not applicable (user, template). */
  confidence: z.number().min(0).max(1).nullable().default(null),
  /**
   * Which dimension property the box drives (`dimension.cuff_width` ← width). Resizing the box
   * updates that measurement and flags the dependent pattern pieces.
   */
  links: z
    .object({
      width: z.string().max(120).nullable().default(null),
      height: z.string().max(120).nullable().default(null),
    })
    .default({ width: null, height: null }),
});
export type ComponentShape = z.infer<typeof componentShapeSchema>;
export type ComponentShapeInput = z.input<typeof componentShapeSchema>;

/** Where a source image sits in the garment frame (mm), for the original-vs-reconstruction overlay. */
export const sourcePlacementSchema = z.object({
  view: z.enum(['front', 'back']),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});
export type SourcePlacement = z.infer<typeof sourcePlacementSchema>;

/** Absolute points (mm, garment frame) of a shape's outline — rotation applied. */
export function shapeOutlineMm(
  s: Pick<ComponentShape, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'path'>,
): { x: number; y: number }[] {
  const cx = s.x + s.width / 2;
  const cy = s.y + s.height / 2;
  const a = (s.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return s.path.map((p) => {
    const px = s.x + p.x * s.width - cx;
    const py = s.y + p.y * s.height - cy;
    return { x: cx + px * cos - py * sin, y: cy + px * sin + py * cos };
  });
}

/** SVG path data for a shape in the garment frame (curves where handles exist). */
export function shapePathD(
  s: Pick<ComponentShape, 'x' | 'y' | 'width' | 'height' | 'path'>,
): string {
  const X = (v: number) => (s.x + v * s.width).toFixed(2);
  const Y = (v: number) => (s.y + v * s.height).toFixed(2);
  const pts = s.path;
  let d = `M${X(pts[0]!.x)} ${Y(pts[0]!.y)}`;
  for (let i = 1; i <= pts.length; i++) {
    const prev = pts[i - 1]!;
    const p = pts[i % pts.length]!;
    if (prev.c2 || p.c1) {
      const a = prev.c2 ?? prev;
      const b = p.c1 ?? p;
      d += ` C${X(a.x)} ${Y(a.y)} ${X(b.x)} ${Y(b.y)} ${X(p.x)} ${Y(p.y)}`;
    } else d += ` L${X(p.x)} ${Y(p.y)}`;
  }
  return `${d} Z`;
}
