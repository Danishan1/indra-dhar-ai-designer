import type { GarmentDesignState } from '@ai-designer/garment-model';
import { pieceDimensions } from '@ai-designer/pattern-model';

import { patternDescription } from './techpack-pattern.js';

/**
 * Look preview (ADR-064): how the garment sewn from the pattern pieces on screen would look, drawn
 * by an image model from four sides. The patterns are the source — the pattern sheet is the first
 * reference image and every piece is listed with its size — so edits (a longer leg, a wider flare,
 * a shortened sleeve) show up in the look. The original sketch, when there is one, only sets the
 * mood. After the front view, it is passed back so the other views show the same garment.
 */

export type LookView = 'front' | 'back' | 'left' | 'right';
export type LookStyle = 'sketch' | 'realistic';

export const LOOK_VIEW_TITLES: Record<LookView, string> = {
  front: 'Front view',
  back: 'Back view',
  left: 'Left side view',
  right: 'Right side view',
};

const FACING: Record<LookView, string> = {
  front: 'FRONT view — the garment faces the viewer',
  back: 'BACK view — seen from behind',
  left: "LEFT SIDE view — profile showing the wearer's left side",
  right: "RIGHT SIDE view — profile showing the wearer's right side",
};

const STYLE: Record<LookStyle, string> = {
  sketch:
    'Draw it as a clean fashion design sketch: a standing croquis figure in neutral grey line work, the garment drawn with confident black lines, light shading for folds and volume, seams, topstitching and closures visible, plain white background.',
  realistic:
    'Render it as a realistic photograph of the garment worn by a neutral dress form with a head-less mannequin silhouette, soft even studio light, plain white background.',
};

/** Each piece with its size and cut, and which pieces were edited by hand (what makes this look). */
export function lookPieceList(state: GarmentDesignState): string {
  return (state.patternPieces ?? [])
    .map((p) => {
      const d = pieceDimensions(p);
      const cm = (mm: number) => (mm / 10).toFixed(1);
      return `- ${p.name}: ${cm(d.width)} × ${cm(d.height)} cm, cut ${p.cutQuantity}${p.foldLine ? ' on the fold' : ''}${p.source === 'user' ? ' (edited by the designer)' : ''}`;
    })
    .join('\n');
}

export interface LookPromptInput {
  state: GarmentDesignState;
  style: LookStyle;
  /** The front view was generated and is passed as a reference. */
  hasFrontReference: boolean;
  /** The original sketch is passed as a (mood only) reference. */
  hasSketch: boolean;
}

export function lookPrompt(view: LookView, input: LookPromptInput): string {
  const { state } = input;
  const description = patternDescription(state) ?? 'A garment.';
  const refs = [
    'Reference image 1 is the PATTERN SHEET: the flat pattern pieces the garment is sewn from, with their names, cut quantity and size. It is the source of truth for the shape: silhouette, lengths, widths, flare, sleeve and leg shape, collar, pockets and every seam come from these pieces.',
    input.hasFrontReference
      ? 'Reference image 2 is the FRONT view already drawn of this exact garment: keep the same garment, proportions, colours, figure and drawing style.'
      : null,
    input.hasSketch
      ? `Reference image ${input.hasFrontReference ? 3 : 2} is the designer's original sketch: use it only for mood and colour; where it differs from the patterns, follow the patterns.`
      : null,
  ].filter(Boolean);
  const edited = (state.patternPieces ?? []).filter((p) => p.source === 'user').map((p) => p.name);
  return [
    `Show how this garment looks when sewn from its patterns. ${description}`,
    `Pattern pieces (seam line sizes):\n${lookPieceList(state)}`,
    edited.length
      ? `The designer edited these pieces by hand — their changed shape must be visible in the garment: ${edited.join(', ')}.`
      : null,
    refs.join('\n'),
    `View: ${FACING[view]}. Show the whole garment, head to hem in frame, centred, nothing cropped.`,
    STYLE[input.style],
    'Do not add details that are not in the patterns. No text, labels, logos or watermarks.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
