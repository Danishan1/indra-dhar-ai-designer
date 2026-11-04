import type { PatternPiece, PatternSpec } from '@ai-designer/garment-model';

import { edgeLength } from './geom.js';
import { resolve } from './resolve.js';
import { capEaseRange } from './sleeve.js';

/**
 * Seam checks (ADR-058): do the pieces still sew together? Computed from the named edges of the
 * pieces as they are now (after any manual edit), so a resized sleeve that no longer fits its
 * armhole is reported. `difference` = b − a; `range` is what is acceptable.
 */

export interface SeamCheck {
  id: string;
  label: string;
  a: number;
  b: number;
  difference: number;
  range: [number, number];
  status: 'ok' | 'warning' | 'error';
  hint: string;
}

type PieceLike = Pick<PatternPiece, 'outline' | 'edges' | 'draft' | 'name'>;
type Term = { template: string | string[]; edge: string; factor?: number; withIntake?: boolean };

export function seamChecks(
  pieces: readonly PieceLike[],
  spec: PatternSpec | null | undefined,
): SeamCheck[] {
  const byTemplate = new Map<string, PieceLike>();
  for (const p of pieces)
    if (p.draft?.template && !byTemplate.has(p.draft.template)) byTemplate.set(p.draft.template, p);
  const len = (t: Term): number | null => {
    const templates = Array.isArray(t.template) ? t.template : [t.template];
    for (const tpl of templates) {
      const p = byTemplate.get(tpl);
      const e = p?.edges?.find((x) => x.name === t.edge);
      if (!p || !e || e.from >= p.outline.length || e.to >= p.outline.length) continue;
      return (edgeLength(p.outline, e) - (t.withIntake ? 0 : e.intakeMm)) * (t.factor ?? 1);
    }
    return null;
  };
  const sum = (terms: Term[]) => {
    let s = 0;
    for (const t of terms) {
      const v = len(t);
      if (v === null) return null;
      s += v;
    }
    return s;
  };
  const out: SeamCheck[] = [];
  const check = (
    id: string,
    label: string,
    a: Term[],
    b: Term[],
    range: [number, number],
    hint: string,
  ) => {
    const va = sum(a);
    const vb = sum(b);
    if (va === null || vb === null) return;
    const d = vb - va;
    const span = Math.max(4, range[1] - range[0]);
    const status =
      d >= range[0] && d <= range[1]
        ? 'ok'
        : d >= range[0] - span && d <= range[1] + span
          ? 'warning'
          : 'error';
    out.push({ id, label, a: round(va), b: round(vb), difference: round(d), range, status, hint });
  };
  const F = ['bodice_front', 'front'];
  const B = ['bodice_back', 'back'];
  check(
    'shoulder',
    'Shoulder seams (front ↔ back)',
    [{ template: F, edge: 'shoulder' }],
    [{ template: ['yoke', ...B], edge: 'shoulder' }],
    [-2, 6],
    'The back shoulder may be up to 6 mm longer (eased in).',
  );
  check(
    'side',
    'Side seams (front ↔ back)',
    [{ template: F, edge: 'side' }],
    [{ template: B, edge: 'side' }],
    [-3, 3],
    'Front and back side seams must be the same length once darts are sewn.',
  );
  if (spec && spec.style.sleeve !== 'none') {
    const ctx = resolve(spec);
    check(
      'cap',
      'Sleeve cap ↔ armhole',
      [
        { template: F, edge: 'armhole' },
        { template: B, edge: 'armhole' },
        { template: 'yoke', edge: 'armhole' },
      ].filter((t) => t.template !== 'yoke' || byTemplate.has('yoke')),
      [{ template: 'sleeve', edge: 'cap', withIntake: true }],
      capEaseRange(ctx),
      'Cap ease: how much longer the sleeve cap is than the armhole.',
    );
    check(
      'underarm',
      'Sleeve underarm seams',
      [{ template: 'sleeve', edge: 'underarm_front' }],
      [{ template: 'sleeve', edge: 'underarm_back' }],
      [-3, 3],
      'Both underarm edges of the sleeve are sewn together.',
    );
    if (byTemplate.has('cuff'))
      check(
        'cuff',
        'Sleeve hem ↔ cuff',
        [{ template: 'sleeve', edge: 'hem' }],
        [{ template: 'cuff', edge: 'top', factor: 1 }],
        [15, 25],
        'The cuff is the sleeve hem (after pleats) plus its overlap.',
      );
    if (byTemplate.has('sleeve_band'))
      check(
        'band',
        'Sleeve hem ↔ band',
        [{ template: 'sleeve', edge: 'hem' }],
        [{ template: 'sleeve_band', edge: 'top' }],
        [-3, 3],
        'The gathered sleeve hem equals the band.',
      );
  }
  check(
    'waist_front',
    'Bodice ↔ skirt (front waist)',
    [{ template: 'bodice_front', edge: 'waist' }],
    [{ template: 'skirt_front', edge: 'waist' }],
    [-6, 6],
    'Bodice and skirt waists must match once darts and gathers are sewn.',
  );
  check(
    'waist_back',
    'Bodice ↔ skirt (back waist)',
    [{ template: 'bodice_back', edge: 'waist' }],
    [{ template: 'skirt_back', edge: 'waist' }],
    [-6, 6],
    'Bodice and skirt waists must match once darts and gathers are sewn.',
  );
  if (!byTemplate.has('bodice_front'))
    check(
      'skirt_side',
      'Skirt side seams (front ↔ back)',
      [{ template: 'skirt_front', edge: 'side' }],
      [{ template: 'skirt_back', edge: 'side' }],
      [-4, 4],
      'Front and back skirt side seams are sewn together.',
    );
  if (byTemplate.has('waistband')) {
    const legs = byTemplate.has('trouser_front');
    check(
      'waistband',
      'Waist ↔ waistband',
      legs
        ? [
            { template: 'trouser_front', edge: 'waist', factor: 2 },
            { template: 'trouser_back', edge: 'waist', factor: 2 },
          ]
        : [
            { template: 'skirt_front', edge: 'waist', factor: 2 },
            { template: 'skirt_back', edge: 'waist', factor: 2 },
          ],
      [{ template: 'waistband', edge: 'long' }],
      [25, 50],
      'The waistband is the finished waist plus the overlap.',
    );
  }
  if (byTemplate.has('collar') || byTemplate.has('collar_stand') || byTemplate.has('collar_band')) {
    const tpl = byTemplate.has('collar_stand')
      ? 'collar_stand'
      : byTemplate.has('collar_band')
        ? 'collar_band'
        : 'collar';
    check(
      'collar',
      'Neckline ↔ collar',
      [
        { template: F, edge: 'neck' },
        { template: B, edge: 'neck' },
      ],
      [{ template: tpl, edge: 'neck' }],
      [-8, 4],
      'The collar neck edge equals the half neckline.',
    );
  }
  if (byTemplate.has('trouser_front')) {
    check(
      'inseam',
      'Inseams (front ↔ back)',
      [{ template: 'trouser_front', edge: 'inseam' }],
      [{ template: 'trouser_back', edge: 'inseam' }],
      [-15, 3],
      'The back inseam may be slightly shorter (stretched when sewing).',
    );
    check(
      'outseam',
      'Outseams (front ↔ back)',
      [{ template: 'trouser_front', edge: 'outseam' }],
      [{ template: 'trouser_back', edge: 'outseam' }],
      [-5, 5],
      'Front and back side seams must match.',
    );
  }
  if (byTemplate.has('facing_front'))
    check(
      'facing',
      'Neckline ↔ front facing',
      [{ template: F, edge: 'neck' }],
      [{ template: 'facing_front', edge: 'neck' }],
      [-2, 2],
      'The facing follows the neckline.',
    );
  return out;
}

const round = (v: number) => Math.round(v * 10) / 10;
