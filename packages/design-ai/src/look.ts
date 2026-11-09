import type { GarmentDesignState, PatternPiece } from '@ai-designer/garment-model';
import { pieceDimensions } from '@ai-designer/pattern-model';

import { patternDescription } from './techpack-pattern.js';

/**
 * Look preview (ADR-064): how the garment sewn from the pattern pieces on screen would look, drawn
 * by an image model. Two kinds:
 *
 * - **model** — the whole outfit worn by a real fashion model, from the views the user chose
 *   (front, back, left, right);
 * - **sketch** — a flat technical line drawing of one garment on its own (no person, dummy or
 *   hanger), front or back; a co-ord set gets one drawing per garment (shirt, shorts…).
 *
 * The patterns are the source — the pattern sheet is the first reference image and every piece is
 * listed with its size — so edits (a longer leg, a wider flare, a shortened sleeve) show up. The
 * first drawing made is passed back so the others show the same garment; the original sketch, when
 * there is one, only sets the mood.
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

function wearer(state: GarmentDesignState): string {
  const spec = state.patternSpec as { audience?: string; size?: string } | undefined;
  const who = WEARER[spec?.audience ?? ''] ?? 'a fashion model';
  const age =
    spec?.size && /^\d+y$/.test(spec.size) ? ` aged about ${parseInt(spec.size, 10)}` : '';
  return `${who}${age}`;
}

/** Each piece with its size and cut, and which pieces were edited by hand (what makes this look). */
export function lookPieceList(
  state: GarmentDesignState,
  pieces: readonly PatternPiece[] = state.patternPieces ?? [],
): string {
  return pieces
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
  /** A view already drawn of this garment, passed as a reference (the first one drawn). */
  reference: LookView | null;
  /** The original sketch is passed as a (mood only) reference. */
  hasSketch: boolean;
  /**
   * Line sketch of one garment of a set: its name and its pieces (the pattern sheet then shows only
   * those). Omit for the whole design.
   */
  garment?: { name: string; pieces: readonly PatternPiece[]; ofSet: boolean } | null;
}

export function lookPrompt(view: LookView, input: LookPromptInput): string {
  const { state, garment } = input;
  const pieces = garment?.pieces ?? state.patternPieces ?? [];
  const description = patternDescription(state) ?? 'A garment.';
  const refs = [
    `Reference image 1 is the PATTERN SHEET: the flat pattern pieces ${garment ? `of the ${garment.name.toLowerCase()}` : 'the garment is sewn from'}, with their names, cut quantity and size. It is the source of truth for the shape: silhouette, lengths, widths, flare, sleeve and leg shape, collar, pockets and every seam come from these pieces.`,
    input.reference
      ? `Reference image 2 is the ${input.reference.toUpperCase()} view already drawn of this exact ${input.style === 'sketch' ? 'garment' : 'outfit'}: keep the same garment, proportions, colours${input.style === 'model' ? ', model' : ''} and drawing style.`
      : null,
    input.hasSketch
      ? `Reference image ${input.reference ? 3 : 2} is the designer's original sketch: use it only for mood and colour; where it differs from the patterns, follow the patterns. Do not copy any person, figure or dummy from it.`
      : null,
  ].filter(Boolean);
  const edited = pieces.filter((p) => p.source === 'user').map((p) => p.name);
  const subject =
    input.style === 'sketch' && garment
      ? `Draw the ${garment.name.toLowerCase()} sewn from its patterns.${garment.ofSet ? ` The design is a set; draw ONLY the ${garment.name.toLowerCase()} — no other garment.` : ''} About the design: ${description}`
      : `Show how this garment looks when sewn from its patterns. ${description}`;
  const look =
    input.style === 'sketch'
      ? [
          `View: ${FACING[view]} of the garment laid out flat.`,
          'Draw it as a technical flat (a fashion line drawing): the garment ON ITS OWN, laid flat and symmetrical, clean black outlines on a plain white background, seams and topstitching as fine dashed lines, buttons, pockets, plackets, darts and pleats drawn where the patterns put them. No shading or only very light shading.',
          'NO person, NO model, NO mannequin or dress form, NO hanger, NO body parts — only the garment.',
        ]
      : [
          `View: ${FACING[view]}. The garment is worn by ${wearer(state)}, full body from head to feet in frame, centred, natural relaxed standing pose.`,
          'Make it a realistic fashion photograph: real person (not a mannequin or dress form), soft even studio light, plain light background, the garment fitting as the patterns describe.',
        ];
  return [
    subject,
    `Pattern pieces (seam line sizes):\n${lookPieceList(state, pieces)}`,
    edited.length
      ? `The designer edited these pieces by hand — their changed shape must be visible in the garment: ${edited.join(', ')}.`
      : null,
    refs.join('\n'),
    ...look,
    'Do not add details that are not in the patterns. No text, labels, logos or watermarks.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
