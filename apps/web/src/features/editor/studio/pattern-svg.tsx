'use client';

import type { PatternPiece } from '@ai-designer/garment-model';
import { patternSheetSvg } from '@ai-designer/pattern-model';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';

/**
 * Pattern pieces drawn by `@ai-designer/pattern-model` (seam line, seam allowance, grainline,
 * notches, fold). The SVG is produced by our own pure code from validated data (escaped text).
 */
export function PatternSheet({
  pieces,
  highlight,
  maxWidth,
  className,
  label = 'Pattern pieces',
}: {
  pieces: readonly PatternPiece[];
  highlight?: ReadonlySet<string>;
  maxWidth?: number;
  className?: string;
  label?: string;
}) {
  const svg = useMemo(
    () =>
      patternSheetSvg(pieces, {
        ...(maxWidth ? { maxWidth } : {}),
        ...(highlight ? { highlight } : {}),
      }).replace(/ width="[^"]*" height="[^"]*"/, ' preserveAspectRatio="xMidYMid meet"'),
    [pieces, highlight, maxWidth],
  );
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('[&_svg]:h-full [&_svg]:w-full', className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
