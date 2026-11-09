import {
  garmentSpec,
  garmentsOf,
  type PatternPiece,
  type PatternSpec,
  patternSpecSchema,
} from '@ai-designer/garment-model';

import { garmentName } from './resolve.js';

/**
 * The garments of a design with their display names (one, or several for a co-ord set) and the
 * pieces that belong to each. Pieces of extra set garments carry their key as a template prefix
 * (`shorts.waistband`, ADR-061); everything else belongs to the main garment.
 */
export interface DesignGarment {
  key: string;
  name: string;
}

export function designGarments(input: PatternSpec): DesignGarment[] {
  const spec = patternSpecSchema.parse(input);
  return garmentsOf(spec).map((g) => ({ key: g.key, name: garmentName(garmentSpec(spec, g.key)) }));
}

export function garmentKeyOfPiece(
  piece: Pick<PatternPiece, 'draft'>,
  garments: readonly DesignGarment[],
): string {
  const template = piece.draft?.template ?? '';
  return garments.find((g) => g.key !== 'main' && template.startsWith(`${g.key}.`))?.key ?? 'main';
}

export function piecesOfGarment<P extends Pick<PatternPiece, 'draft'>>(
  pieces: readonly P[],
  garments: readonly DesignGarment[],
  key: string,
): P[] {
  return pieces.filter((p) => garmentKeyOfPiece(p, garments) === key);
}
