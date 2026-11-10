import {
  type CustomSizeChart,
  type GarmentDesignState,
  patternSpecSchema,
  type SizeSystem,
} from '@ai-designer/garment-model';
import {
  BODY_LABELS,
  draftPattern,
  measurementsForSpec,
  patternDesignState,
  SIZE_SYSTEM_LABELS,
  specForSize,
  specMeasurements,
} from '@ai-designer/pattern-model';

import { patternSection } from './techpack-pattern.js';

/**
 * The tech pack size chart (ADR-067): every point of measure of the finished garment and every
 * body measurement, for each size the user chose in one standard. The base size is the drawn
 * patterns (hand edits included); the other sizes are graded by drafting each size and adding the
 * difference to the base, so the designer's changes carry through every size.
 */

export interface TechPackSizing {
  system: SizeSystem;
  /** The organization chart copied when `system` is `custom`. */
  customChart?: CustomSizeChart | null;
  baseSize: string;
  sizes: string[];
}

export interface SizeChartSection {
  standard: string;
  baseSize: string;
  sizes: string[];
  /** Finished garment, mm per size (null when that size cannot be drafted). */
  pom: { label: string; values: (number | null)[] }[];
  /** Body measurements the sizes stand for, mm per size. */
  body: { label: string; values: number[] }[];
  notes: string[];
}

export function sizeChartSection(
  state: GarmentDesignState,
  sizing: TechPackSizing,
): SizeChartSection | null {
  if (!state.patternSpec) return null;
  const spec = patternSpecSchema.parse(state.patternSpec);
  const base = {
    ...spec,
    sizeSystem: sizing.system,
    size: sizing.baseSize,
    ...(sizing.customChart ? { customChart: sizing.customChart } : {}),
  };
  if (sizing.system !== 'custom') delete (base as { customChart?: unknown }).customChart;
  const sizes = sizing.sizes.includes(sizing.baseSize)
    ? sizing.sizes
    : [sizing.baseSize, ...sizing.sizes];

  const finishedOf = (st: GarmentDesignState) =>
    new Map((patternSection(st)?.finished ?? []).map((f) => [f.label, f.valueMm]));
  const drafted = (size: string) => {
    try {
      const sized = specForSize(base, size);
      return {
        spec: sized,
        finished: finishedOf(patternDesignState(draftPattern(sized), { createdFrom: 'ai' })),
      };
    } catch {
      return null;
    }
  };
  const actual = finishedOf(state);
  const baseDraft = drafted(sizing.baseSize);
  const perSize = sizes.map((s) => drafted(s));

  const labels = [...actual.keys()];
  const pom = labels.map((label) => ({
    label,
    values: perSize.map((d, i) => {
      if (sizes[i] === sizing.baseSize) return actual.get(label) ?? null;
      const v = d?.finished.get(label);
      const b = baseDraft?.finished.get(label);
      const a = actual.get(label);
      if (v === undefined) return null;
      return Math.round(a !== undefined && b !== undefined ? a + (v - b) : v);
    }),
  }));

  // Height first (it defines children's sizes), then what the garment is drafted from.
  const keys = [...new Set(['height' as const, ...measurementsForSpec(spec)])];
  const body = keys.map((k) => ({
    label: BODY_LABELS[k],
    values: perSize.map((d, i) => {
      const sized = d?.spec ?? specForSize(base, sizes[i]!);
      return Math.round(sized.body[k] ?? specMeasurements(sized)[k] ?? 0);
    }),
  }));

  const edited = (state.patternPieces ?? []).filter((p) => p.source === 'user').map((p) => p.name);
  const standard =
    sizing.system === 'custom'
      ? (sizing.customChart?.name ?? 'Custom')
      : SIZE_SYSTEM_LABELS[sizing.system];
  return {
    standard,
    baseSize: sizing.baseSize,
    sizes,
    pom,
    body,
    notes: [
      `Finished garment measurements include ease. The patterns are drawn in the base size (${sizing.baseSize}).`,
      sizes.length > 1
        ? 'Other sizes are graded by drafting each size from its body measurements and keeping every change made to the base.'
        : 'Add more sizes when generating the tech pack to grade the size range.',
      ...(edited.length
        ? [
            `Pieces edited by hand (${edited.join(', ')}) are drawn in the base size; check their grading before cutting other sizes.`,
          ]
        : []),
    ],
  };
}
