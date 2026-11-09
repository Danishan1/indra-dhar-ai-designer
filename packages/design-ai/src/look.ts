import type { GarmentDesignState, PatternPiece } from '@ai-designer/garment-model';
import { pieceDimensions, sewingOrder } from '@ai-designer/pattern-model';

import { patternSection } from './techpack-pattern.js';

/**
 * Look preview (ADR-064): how the garment would look when it is actually cut and sewn from the
 * pattern pieces on screen. **The patterns are the only input** — the pattern sheet image and a
 * description built from the patterns and the pattern settings (pieces with sizes and seam lengths,
 * which pieces were edited, finished measurements, how they are sewn together). The original sketch,
 * reference photos and the AI's reading of them are never sent: the designer edits the patterns, and
 * the look must show the edited patterns, even when that differs from where the design started.
 *
 * - **model** — the outfit worn by a real model, from the views the user chose
 *   (front, back, left, right), in a plain neutral fabric (colour is not part of the patterns);
 * - **sketch** — a flat technical line drawing of one garment on its own: black lines only, no
 *   colour, no person, dummy or hanger; front or back. A set gets one drawing per garment.
 *
 * Within one look, the first drawing made is passed back (it was itself drawn from the patterns) so
 * the other views show the same garment.
 */

export type LookView = 'front' | 'back' | 'left' | 'right';
export type LookStyle = 'model' | 'sketch';

export const LOOK_VIEW_TITLES: Record<LookView, string> = {
  front: 'Front view',
  back: 'Back view',
  left: 'Left side view',
  right: 'Right side view',
};

const FACING: Record<LookView, string> = {
  front: 'FRONT view — facing the viewer',
  back: 'BACK view — seen from behind',
  left: 'LEFT SIDE view — profile showing the left side',
  right: 'RIGHT SIDE view — profile showing the right side',
};

const WEARER: Record<string, string> = {
  women: 'an adult woman fashion model',
  men: 'an adult man fashion model',
  girls: 'a girl model',
  boys: 'a boy model',
};

const cm = (mm: number) => (mm / 10).toFixed(1);

function wearer(state: GarmentDesignState): string {
  const spec = state.patternSpec as { audience?: string; size?: string } | undefined;
  const who = WEARER[spec?.audience ?? ''] ?? 'a fashion model';
  const age =
    spec?.size && /^\d+y$/.test(spec.size) ? ` aged about ${parseInt(spec.size, 10)}` : '';
  return `${who}${age}`;
}

/**
 * Each piece with its size, cut, seam lengths and whether the designer edited it — the shapes the
 * garment is sewn from, in words (the pattern sheet shows them as a picture).
 */
export function lookPieceList(
  state: GarmentDesignState,
  pieces: readonly PatternPiece[] = state.patternPieces ?? [],
): string {
  return pieces
    .map((p) => {
      const d = pieceDimensions(p);
      const seams = d.edges.length
        ? `; seams: ${d.edges.map((e) => `${e.label} ${cm(e.length)}`).join(', ')} cm`
        : '';
      return `- ${p.name}: ${cm(d.width)} × ${cm(d.height)} cm, cut ${p.cutQuantity}${p.foldLine ? ' on the fold' : ''}${p.mirrored ? ' (mirrored pair)' : ''}${seams}${p.source === 'user' ? ' — EDITED by the designer' : ''}`;
    })
    .join('\n');
}

/**
 * What the patterns say about the garment: garments, wearer and size, the pattern settings and the
 * finished measurements. For one garment of a set, only that garment's settings.
 */
export function lookPatternFacts(state: GarmentDesignState, garmentName?: string | null): string {
  const section = patternSection(state);
  if (!section) return '';
  const set = section.garments.length > 1;
  const mine = (label: string) =>
    !set || !garmentName ? true : label.startsWith(`${garmentName} · `);
  const strip = (label: string) =>
    set && garmentName ? label.replace(`${garmentName} · `, '') : label;
  const who = `${section.audience}, size ${section.size}`;
  const garments = garmentName
    ? `${garmentName} for ${who}${set ? ` (one garment of a set of ${section.garments.map((g) => g.name.toLowerCase()).join(' and ')})` : ''}.`
    : set
      ? `A set of ${section.garments.map((g) => g.name.toLowerCase()).join(' and ')} for ${who}.`
      : `${section.garments[0]?.name ?? 'Garment'} for ${who}.`;
  const style = section.style
    .filter((s) => mine(s.label))
    .map((s) => `${strip(s.label)}: ${s.value}`);
  const finished = section.finished
    .filter((f) => mine(f.label))
    .map((f) => `${strip(f.label).toLowerCase()} ${cm(f.valueMm)} cm`);
  return [
    garments,
    style.length ? `Pattern settings: ${style.join('; ')}.` : null,
    finished.length ? `Finished measurements: ${finished.join(', ')}.` : null,
    `Seam allowance ${cm(section.seamAllowanceMm)} cm, hem allowance ${cm(section.hemAllowanceMm)} cm (not visible on the finished garment).`,
  ]
    .filter(Boolean)
    .join(' ');
}

/** How the pieces are sewn together (for the whole design; null when it cannot be derived). */
function assembly(state: GarmentDesignState): string | null {
  if (!state.patternSpec || !state.patternPieces?.length) return null;
  try {
    const steps = sewingOrder({
      patternSpec: state.patternSpec,
      components: state.components,
      patternPieces: state.patternPieces,
    });
    return steps.length
      ? steps
          .slice(0, 16)
          .map((s) => `${s.step}. ${s.title}: ${s.detail}`)
          .join('\n')
      : null;
  } catch {
    return null;
  }
}

export interface LookPromptInput {
  state: GarmentDesignState;
  style: LookStyle;
  /** A view of this garment already drawn from the patterns, passed back (the first one drawn). */
  reference: LookView | null;
  /**
   * Line sketch of one garment of a set: its name and its pieces (the pattern sheet then shows only
   * those). Omit for the whole design.
   */
  garment?: { name: string; pieces: readonly PatternPiece[]; ofSet: boolean } | null;
}

export function lookPrompt(view: LookView, input: LookPromptInput): string {
  const { state, garment } = input;
  const pieces = garment?.pieces ?? state.patternPieces ?? [];
  const single = garment?.ofSet ? garment.name : null;
  const name = garment?.name.toLowerCase() ?? 'garment';
  const edited = pieces.filter((p) => p.source === 'user').map((p) => p.name);
  const steps = garment?.ofSet ? null : assembly(state);
  const refs = [
    `Reference image 1 is the PATTERN SHEET: the flat pattern pieces ${garment?.ofSet ? `of the ${name}` : 'of the garment'}, with their names, cut quantity and size. These pieces are cut from fabric and sewn together — the garment you draw is exactly what they make: silhouette, lengths, widths, flare, sleeve and leg shape, neckline, collar, pockets and every seam come from these pieces and nothing else.`,
    input.reference
      ? `Reference image 2 is the ${input.reference.toUpperCase()} view already drawn from these same patterns: keep the same garment, proportions${input.style === 'model' ? ', fabric and model' : ' and line style'}.`
      : null,
  ].filter(Boolean);
  const look =
    input.style === 'sketch'
      ? [
          `View: ${FACING[view]} of the ${name} laid out flat.`,
          `Draw it as a technical flat: the ${name} ON ITS OWN, laid flat and symmetrical, plain black outlines on a white background. Seams and topstitching as fine dashed lines; buttons, pockets, plackets, darts, pleats and gathers drawn exactly where the patterns put them.`,
          'BLACK LINES ONLY: no colour, no fill, no fabric texture or print, no shading. NO person, NO model, NO mannequin or dress form, NO hanger, NO body parts.',
        ]
      : [
          `View: ${FACING[view]}. The garment is worn by ${wearer(state)}, full body from head to feet in frame, centred, natural relaxed standing pose.`,
          'Make it a realistic fashion photograph: a real person (not a mannequin or dress form), soft even studio light, plain light grey background. The fabric is a plain, solid, neutral off-white with no print or pattern (fabric and colour are not part of the patterns); the garment fits and drapes exactly as these pieces make it.',
        ];
  return [
    input.style === 'sketch'
      ? `Draw the ${name} made by cutting and sewing these pattern pieces.${single ? ` The design is a set; draw ONLY the ${name} — no other garment.` : ''}`
      : 'Show the garment that is made by cutting and sewing these pattern pieces, as it looks when worn.',
    'The patterns are the only source: there is no sketch or photo. The designer has edited them, so draw what the pieces make — do not fall back on a typical garment of this kind.',
    lookPatternFacts(state, single),
    `Pattern pieces (seam line sizes):\n${lookPieceList(state, pieces)}`,
    edited.length
      ? `Edited by hand — their changed shape must be visible in the garment: ${edited.join(', ')}.`
      : null,
    steps ? `How the pieces are sewn together:\n${steps}` : null,
    refs.join('\n'),
    ...look,
    'Do not add details that are not in the patterns. No text, labels, logos or watermarks.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
