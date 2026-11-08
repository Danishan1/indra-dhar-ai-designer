'use client';

import type { PatternPiece } from '@ai-designer/garment-model';
import { useState } from 'react';

import type { Unit } from '../options';

import { type CadSettings, type CadTool, PatternCad } from './pattern-cad';

const SETTINGS: CadSettings = {
  snapGrid: false,
  snapPoints: false,
  showGrid: true,
  showAllowance: true,
  showDimensions: true,
  pxPerMm: 96 / 25.4,
};

/**
 * Read-only CAD view (review page, ADR-060): the same drawing as the editor — rulers, cutting
 * lines, fold and grain marks, every seam dimensioned — so what the user approves is exactly what
 * opens in the editor. Click a piece to highlight it; drag to pan, wheel to zoom.
 */
export function PatternPreview({ pieces, unit }: { pieces: readonly PatternPiece[]; unit: Unit }) {
  const [tool, setTool] = useState<CadTool>('select');
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <PatternCad
      pieces={pieces}
      unit={unit}
      editable={false}
      tool={tool}
      onTool={setTool}
      settings={SETTINGS}
      selectedId={selected}
      onSelect={setSelected}
      nodes={[]}
      onNodes={() => undefined}
      onCommit={() => undefined}
    />
  );
}
