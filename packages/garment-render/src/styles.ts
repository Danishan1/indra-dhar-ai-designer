/**
 * Line styles per element role (FR-RV-028). Stroke widths are screen pixels (the canvas and the SVG
 * export use `vector-effect: non-scaling-stroke`), dashes are in pixels too.
 */
import type { ElementRole } from './types.js';

export interface LineStyle {
  stroke: string;
  width: number;
  dash: string | null;
  opacity: number;
}

const INK = '#1f2328';

export const ROLE_STYLES: Readonly<Record<ElementRole, LineStyle>> = Object.freeze({
  panel: { stroke: INK, width: 1.2, dash: null, opacity: 1 },
  silhouette: { stroke: INK, width: 1.6, dash: null, opacity: 1 },
  seam: { stroke: INK, width: 1, dash: null, opacity: 1 },
  stitch: { stroke: INK, width: 0.8, dash: '3 2', opacity: 0.9 },
  fold: { stroke: INK, width: 0.8, dash: '7 3', opacity: 0.8 },
  hidden: { stroke: '#6b7280', width: 0.8, dash: '2 2', opacity: 0.8 },
  detail: { stroke: INK, width: 0.9, dash: null, opacity: 1 },
  trim: { stroke: '#7c3aed', width: 1, dash: null, opacity: 1 },
  approximate: { stroke: '#b45309', width: 1, dash: '4 3', opacity: 1 },
  artwork: { stroke: '#2563eb', width: 1, dash: '5 3', opacity: 1 },
  guide: { stroke: '#94a3b8', width: 0.7, dash: '8 4', opacity: 0.8 },
});

/** Neutral fill when the design has no colour yet (a display choice, not a design value). */
export const NEUTRAL_FILL = '#f3f2ef';
