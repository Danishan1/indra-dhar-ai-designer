import {
  defaultCatalog,
  type DesignComponent,
  type GarmentDesignState,
  outlineBounds,
  type PatternPiece,
  type PropertyValue,
} from '@ai-designer/garment-model';
import { geometryCapability, renderGarment, sceneToSvg } from '@ai-designer/garment-render';
import {
  buildMarkers,
  cutOutline,
  EDGE_LABELS,
  type Marker,
  markerSvg,
  patternSheetSvg,
  sewingOrder,
} from '@ai-designer/pattern-model';

import type { TechPackText } from './analysis-schema.js';
import { ATTRIBUTE_PROPERTY } from './library-match.js';
import { type PatternSection, patternSection } from './techpack-pattern.js';
import { componentShapeSvg, pieceDetailSvg } from './techpack-vector.js';

/**
 * Tech pack document (ADR-056): built **only** from a finalized (committed) design revision. AI
 * contributes images and drafted text, flagged as such; everything else comes from the structured
 * design, and what is missing is listed instead of invented.
 */

export interface TechPackImage {
  key: string;
  title: string;
  kind: 'flat' | 'ai' | 'crop' | 'pattern' | 'original' | 'reconstruction';
  assetId?: string | null;
  /** Inline SVG (technical flats, pattern sheets). */
  svg?: string | null;
  note?: string | null;
}

export interface TechPackHeader {
  designName: string;
  designDisplayId: string;
  revisionLabel: string;
  revisionId: string;
  projectName: string;
  garmentLabel: string;
  category: string;
  audience: string;
  generatedAt: string;
  provider: string;
}

export type SpecStatus =
  | 'confirmed'
  | 'inferred'
  | 'proposed'
  | 'missing'
  | 'needs_review'
  | 'not_applicable'
  | 'estimate';

export interface TechPackDocument {
  version: 1;
  header: TechPackHeader;
  disclaimer: string;
  description: string;
  descriptionSource: 'ai_draft' | 'design';
  /** The images the design was started from — references only, never the specification. */
  references: TechPackImage[];
  views: TechPackImage[];
  components: {
    componentId: string;
    name: string;
    type: string;
    side: string;
    description: string;
    attributes: { label: string; value: string; status: SpecStatus }[];
    fabric: string | null;
    measurements: { label: string; valueMm: number | null; status: SpecStatus }[];
    patternPieces: number;
    image: TechPackImage | null;
  }[];
  bom: {
    item: string;
    type: 'fabric' | 'trim' | 'thread' | 'label' | 'interfacing';
    placement: string;
    quantity: string;
    status: 'specified' | 'estimate' | 'missing';
    notes: string;
  }[];
  measurements: {
    component: string;
    point: string;
    valueMm: number | null;
    status: SpecStatus;
    source: string;
  }[];
  patterns: {
    sheet: TechPackImage | null;
    pieces: {
      name: string;
      component: string;
      cutQuantity: number;
      onFold: boolean;
      mirrored: boolean;
      widthMm: number;
      heightMm: number;
      seamAllowanceMm: number | null;
      /** Edges with their own allowance (hems) and fold edges (0 mm). */
      allowanceNotes: string[];
      fabricRole: string | null;
      source: string;
      status: string;
      notes: string[];
      pieceId: string;
      /** Dimensioned vector drawing with a 10 cm scale bar. */
      svg: string;
    }[];
    /** Cutting layouts per fabric (ADR-060): grain along the length, planning estimate. */
    markers: {
      fabricRole: string;
      fabricWidthMm: number;
      lengthMm: number;
      efficiency: number;
      pieceCount: number;
      svg: string;
    }[];
  };
  construction: {
    aiDrafted: boolean;
    steps: { title: string; details: string; components: string[] }[];
    stitching: { seam: string; stitch: string; notes: string }[];
    finishing: string[];
  };
  quality: string[];
  care: string[];
  missing: { area: string; item: string }[];
  /** Pattern-first designs (ADR-058): drafting spec, measurements, fit checks. */
  pattern?: PatternSection | null;
}

export interface ArtifactName {
  name: string;
  category: string;
  color?: string | null;
  composition?: string | null;
}

export interface TechPackInput {
  state: GarmentDesignState;
  header: Omit<TechPackHeader, 'garmentLabel' | 'category' | 'audience'>;
  artifacts: ReadonlyMap<string, ArtifactName>;
  text: TechPackText | null;
  views: TechPackImage[];
  componentImages: Readonly<Record<string, TechPackImage>>;
  references?: TechPackImage[];
}

const human = (s: string) => s.replaceAll('_', ' ');
const label = (key: string) =>
  defaultCatalog.properties.get(key)?.label ?? human(key.split('.').pop() ?? key);
const statusOf = (pv: PropertyValue | undefined): SpecStatus => (pv ? pv.status : 'missing');

function valueText(
  pv: PropertyValue | undefined,
  artifacts: ReadonlyMap<string, ArtifactName>,
): string | null {
  if (!pv || pv.value === null) return null;
  const v = pv.value as unknown;
  if (typeof v === 'string') return human(v);
  if (typeof v === 'number') return pv.unit ? `${v} ${pv.unit}` : String(v);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (v && typeof v === 'object' && 'entityId' in v) {
    const ref = v as { entityId: string; revisionId?: string | null };
    return artifacts.get(ref.revisionId ?? ref.entityId)?.name ?? 'Referenced artifact';
  }
  if (Array.isArray(v)) return v.map((x) => JSON.stringify(x)).join(', ');
  return JSON.stringify(v);
}

function mm(pv: PropertyValue | undefined): number | null {
  if (!pv || typeof pv.value !== 'number') return null;
  const factor = pv.unit === 'cm' ? 10 : pv.unit === 'in' ? 25.4 : 1;
  return Math.round(pv.value * factor);
}

/** Polygon area (mm²). */
function area(points: readonly { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2);
}

/** Technical flats for families the parametric renderer draws (shirt / T-shirt). */
export function technicalFlats(state: GarmentDesignState): TechPackImage[] {
  if (geometryCapability(state) !== 'G2') return [];
  const scene = renderGarment(state);
  return (['front', 'back'] as const).map((view) => ({
    key: `flat_${view}`,
    title: `Technical flat — ${view}`,
    kind: 'flat',
    svg: sceneToSvg(scene, { view, title: `Technical flat (${view})`, background: '#ffffff' }),
  }));
}

export function buildTechPack(input: TechPackInput): TechPackDocument {
  const { state, artifacts } = input;
  const meta = state.metadata as Record<string, unknown>;
  const garmentLabel =
    (typeof meta['garmentLabel'] === 'string' && meta['garmentLabel']) ||
    (state.garmentCategory
      ? (defaultCatalog.categories.get(state.garmentCategory)?.label ??
        human(state.garmentCategory))
      : human(state.garmentType));
  const pieces = state.patternPieces ?? [];
  const nameOf = (id: string) =>
    state.components.find((c) => c.componentId === id)?.displayName ?? id;
  const missing: TechPackDocument['missing'] = [];

  const components: TechPackDocument['components'] = state.components
    .filter(
      (c) =>
        c.componentType !== 'garment_body' ||
        Object.values(c.properties).some((p) => p.value !== null),
    )
    .map((c: DesignComponent) => {
      const attrs = Object.values(ATTRIBUTE_PROPERTY)
        .filter((k) => k in c.properties && !k.startsWith('dimension.'))
        .map((k) => ({
          label: label(k),
          value: valueText(c.properties[k], artifacts) ?? '—',
          status: statusOf(c.properties[k]),
        }));
      const dims = Object.keys(c.properties)
        .filter((k) => k.startsWith('dimension.'))
        .map((k) => ({
          label: label(k),
          valueMm: mm(c.properties[k]),
          status: statusOf(c.properties[k]),
        }));
      const fabric = valueText(c.properties['material.fabric_ref'], artifacts);
      return {
        componentId: c.componentId,
        name: c.displayName,
        type: defaultCatalog.componentTypes.get(c.componentType)?.label ?? human(c.componentType),
        side: c.side,
        description:
          typeof (c as Record<string, unknown>)['description'] === 'string'
            ? ((c as Record<string, unknown>)['description'] as string)
            : '',
        attributes: attrs,
        fabric,
        measurements: dims,
        patternPieces: pieces.filter((p) => p.componentId === c.componentId).length,
        image:
          (() => {
            const svg = componentShapeSvg(c);
            return svg
              ? {
                  key: `shape_${c.componentId}`,
                  title: c.displayName,
                  kind: 'reconstruction' as const,
                  svg,
                }
              : null;
          })() ??
          input.componentImages[c.componentId] ??
          null,
      };
    });

  // Measurements table + missing critical values.
  const measurements: TechPackDocument['measurements'] = [];
  for (const c of state.components)
    for (const [key, pv] of Object.entries(c.properties)) {
      const def = defaultCatalog.properties.get(key);
      if (!def) continue;
      if (key.startsWith('dimension.'))
        measurements.push({
          component: c.displayName,
          point: def.label,
          valueMm: mm(pv),
          status: pv.status,
          source:
            pv.sourceType === 'ai_interpretation'
              ? 'AI estimate'
              : pv.sourceType === 'user_input'
                ? 'Entered'
                : human(pv.sourceType),
        });
      if (
        def.manufacturingCritical &&
        (pv.status === 'missing' || pv.value === null) &&
        pv.status !== 'not_applicable'
      )
        missing.push({ area: c.displayName, item: `${def.label} not specified` });
      else if (def.manufacturingCritical && (pv.status === 'inferred' || pv.status === 'proposed'))
        missing.push({
          area: c.displayName,
          item: `${def.label} is an unconfirmed ${pv.status === 'inferred' ? 'AI estimate' : 'proposal'}`,
        });
    }

  // Pattern-first designs: measurements come from the patterns, not component properties.
  const pattern = patternSection(state);
  const markers: Marker[] = pattern && pieces.length ? buildMarkers(pieces) : [];
  if (pattern) {
    measurements.length = 0;
    for (const b of pattern.body)
      measurements.push({
        component: 'Body',
        point: b.label,
        valueMm: b.valueMm,
        status: b.source === 'edited' ? 'confirmed' : 'proposed',
        source: b.source === 'edited' ? 'Entered' : `Size chart ${pattern.size}`,
      });
    for (const f of pattern.finished)
      measurements.push({
        component: 'Garment',
        point: f.label,
        valueMm: f.valueMm,
        status: 'proposed',
        source: 'Measured on the pattern',
      });
    for (let i = missing.length - 1; i >= 0; i--)
      if (/size|length|width|height|depth|allowance/i.test(missing[i]!.item)) missing.splice(i, 1);
    for (const c of pattern.checks.filter((x) => x.status !== 'ok'))
      missing.push({ area: 'Pattern fit', item: `${c.label}: off by ${c.difference} mm` });
    if (pattern.editedPieces.length)
      missing.push({
        area: 'Pattern',
        item: `Edited by hand, check before cutting: ${pattern.editedPieces.join(', ')}`,
      });
    missing.push({ area: 'Pattern', item: 'Make and fit a sample (toile) before production' });
  }

  // Bill of materials.
  const bom: TechPackDocument['bom'] = [];
  const fabricUse = new Map<
    string,
    { name: string; placements: string[]; area: number; composition: string | null }
  >();
  for (const c of state.components) {
    const ref = c.properties['material.fabric_ref']?.value as
      { entityId?: string; revisionId?: string | null } | null | undefined;
    const id = ref?.revisionId ?? ref?.entityId;
    if (!id) continue;
    const a = artifacts.get(id);
    const entry = fabricUse.get(id) ?? {
      name: a?.name ?? 'Fabric',
      placements: [],
      area: 0,
      composition: a?.composition ?? null,
    };
    entry.placements.push(c.displayName);
    const descendants = new Set([c.componentId]);
    for (let grew = true; grew;) {
      grew = false;
      for (const x of state.components)
        if (
          x.parentComponentId &&
          descendants.has(x.parentComponentId) &&
          !descendants.has(x.componentId)
        ) {
          const xr = x.properties['material.fabric_ref']?.value as
            { entityId?: string } | null | undefined;
          if (!xr) {
            descendants.add(x.componentId);
            grew = true;
          }
        }
    }
    for (const p of pieces)
      if (descendants.has(p.componentId))
        entry.area += area(cutOutline(p)) * p.cutQuantity * (p.foldLine ? 2 : 1);
    fabricUse.set(id, entry);
  }
  for (const f of fabricUse.values()) {
    const metres = f.area > 0 ? Math.max(0.1, (f.area * 1.2) / 1_500_000) : null;
    bom.push({
      item: f.name,
      type: 'fabric',
      placement: f.placements.join(', '),
      quantity: metres ? `≈ ${metres.toFixed(2)} m at 150 cm width` : 'not estimated',
      status: metres ? 'estimate' : 'missing',
      notes: f.composition ? `Composition: ${f.composition}` : 'Composition not specified',
    });
    if (!f.composition) missing.push({ area: f.name, item: 'Fabric composition and weight' });
  }
  if (!fabricUse.size && pattern) {
    // Pattern-first: estimate the yardage from the pieces themselves.
    // Pattern-first: yardage from the cutting layout (+5 % for shrinkage and ends).
    for (const m of markers) {
      const metres = Math.max(0.1, (m.lengthMm * 1.05) / 1000);
      const main = m.fabricRole === 'main';
      bom.push({
        item: main ? 'Main fabric' : `${human(m.fabricRole)} fabric`,
        type: m.fabricRole === 'interfacing' ? ('interfacing' as const) : ('fabric' as const),
        placement: `${m.pieceCount} pieces — see cutting layout`,
        quantity: `≈ ${metres.toFixed(2)} m at ${m.fabricWidthMm / 10} cm width`,
        status: 'estimate',
        notes: main
          ? `Choose the fabric; from the cutting layout (${Math.round(m.efficiency * 100)} % used) + 5 %`
          : `From the cutting layout (${Math.round(m.efficiency * 100)} % used) + 5 %`,
      });
    }
    const zips = pieces.flatMap((p) => p.markings ?? []).filter((m) => m.kind === 'zip');
    if (zips.length)
      bom.push({
        item: 'Zip',
        type: 'trim',
        placement: zips.map((z) => z.label ?? 'zip').join(', '),
        quantity: '1',
        status: 'estimate',
        notes: 'Length from the zip marking on the pattern',
      });
    const btns = pieces.reduce(
      (n, p) =>
        n +
        (p.markings ?? []).filter((m) => m.kind === 'button').length *
          (p.mirrored || p.cutQuantity > 1 ? 1 : 1),
      0,
    );
    if (btns)
      bom.push({
        item: 'Buttons',
        type: 'trim',
        placement: 'As marked on the pattern',
        quantity: `${btns} pcs`,
        status: 'estimate',
        notes: 'Size, material and colour not specified',
      });
    missing.push({ area: 'Materials', item: 'Fabric not chosen' });
  } else if (!fabricUse.size) {
    bom.push({
      item: 'Main fabric',
      type: 'fabric',
      placement: 'All',
      quantity: '—',
      status: 'missing',
      notes: 'No fabric assigned in the design',
    });
    missing.push({ area: 'Materials', item: 'No fabric assigned' });
  }
  let buttons = 0;
  for (const c of state.components) {
    const n = c.properties['construction.button_count']?.value;
    if (typeof n === 'number') buttons += n;
  }
  if (buttons)
    bom.push({
      item: 'Buttons',
      type: 'trim',
      placement: 'Closure',
      quantity: `${buttons} pcs`,
      status: 'estimate',
      notes: 'Size, material and colour not specified',
    });
  for (const c of state.components)
    for (const b of c.artifactBindings) {
      if (b.role === 'fabric') continue;
      const a = artifacts.get(b.artifactRevisionId);
      if (!a || !['lace', 'trim', 'embroidery', 'button', 'artwork'].includes(a.category)) continue;
      bom.push({
        item: a.name,
        type: 'trim',
        placement: c.displayName,
        quantity: '1 set',
        status: 'estimate',
        notes: human(a.category),
      });
    }
  const fused = state.components.filter((c) =>
    ['collar', 'cuff', 'collar_stand', 'placket', 'waistband'].includes(c.componentType),
  );
  if (fused.length)
    bom.push({
      item: 'Fusible interfacing',
      type: 'interfacing',
      placement: fused.map((c) => c.displayName).join(', '),
      quantity: 'per pattern',
      status: 'estimate',
      notes: 'Weight to be specified',
    });
  bom.push({
    item: 'Sewing thread',
    type: 'thread',
    placement: 'All seams',
    quantity: '—',
    status: 'missing',
    notes: 'Colour matched to main fabric; ticket number not specified',
  });
  bom.push({
    item: 'Care / size label',
    type: 'label',
    placement: 'Inside back neck or side seam',
    quantity: '1',
    status: 'missing',
    notes: 'Content not specified',
  });

  // Patterns.
  const patternRows = pieces.map((p) => {
    const b = outlineBounds(p.outline);
    if (p.status !== 'confirmed')
      missing.push({
        area: `Pattern: ${p.name}`,
        item: 'Provisional pattern — needs a pattern maker to verify',
      });
    return {
      name: p.name,
      component: nameOf(p.componentId),
      cutQuantity: p.cutQuantity,
      onFold: !!p.foldLine,
      mirrored: p.mirrored,
      widthMm: Math.round(b.width * (p.foldLine ? 2 : 1)),
      heightMm: Math.round(b.height),
      seamAllowanceMm: p.seamAllowanceMm,
      allowanceNotes: allowanceNotes(p),
      fabricRole: p.fabricRole,
      source: p.source,
      status: p.status,
      notes: p.notes,
      pieceId: p.pieceId,
      svg: pieceDetailSvg(p),
    };
  });
  if (!pieces.length) missing.push({ area: 'Patterns', item: 'No pattern pieces in the design' });

  const text = input.text;
  const steps = text?.constructionSteps.length
    ? text.constructionSteps
    : state.patternSpec
      ? sewingOrder({
          patternSpec: state.patternSpec,
          components: state.components,
          patternPieces: pieces,
        }).map((x) => ({ title: x.title, details: x.detail, components: [] }))
      : defaultSteps(state);
  const missingInfo = Array.isArray(meta['missingInformation'])
    ? (meta['missingInformation'] as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  for (const m of missingInfo) missing.push({ area: 'From the analysis', item: m });

  return {
    version: 1,
    pattern,
    header: {
      ...input.header,
      garmentLabel,
      category: state.garmentCategory
        ? (defaultCatalog.categories.get(state.garmentCategory)?.label ?? state.garmentCategory)
        : human(state.garmentType),
      audience: typeof meta['audience'] === 'string' ? meta['audience'] : 'unknown',
    },
    disclaimer:
      'Generated from the finalized design revision. AI images and AI-drafted text are visual and editorial aids. Patterns are provisional and measurements marked as estimates are not manufacturing-accurate — verify before production.',
    description:
      text?.description ||
      (typeof meta['description'] === 'string' ? meta['description'] : garmentLabel),
    descriptionSource: text?.description ? 'ai_draft' : 'design',
    references: input.references ?? [],
    views: input.views,
    components,
    bom,
    measurements,
    patterns: {
      sheet: pieces.length
        ? {
            key: 'pattern_sheet',
            title: 'Pattern sheet',
            kind: 'pattern',
            svg: patternSheetSvg(pieces, {
              title: `${input.header.designName} — pattern pieces (provisional)`,
            }),
          }
        : null,
      pieces: patternRows,
      markers: markers.map((m) => ({
        fabricRole: m.fabricRole,
        fabricWidthMm: m.fabricWidthMm,
        lengthMm: m.lengthMm,
        efficiency: m.efficiency,
        pieceCount: m.pieceCount,
        svg: markerSvg(m),
      })),
    },
    construction: {
      aiDrafted: !!text?.constructionSteps.length,
      steps,
      stitching: text?.stitching ?? [],
      finishing: text?.finishing ?? [],
    },
    quality: text?.qualityCheckpoints.length
      ? text.qualityCheckpoints
      : [
          'Check symmetry of left/right parts',
          'Check all seams are secure and even',
          'Measure finished garment against the specification',
        ],
    care: text?.careNotes ?? [],
    missing: dedupe(missing),
  };
}

/** Allowances that differ from the piece's seam allowance (hems) and fold edges. */
function allowanceNotes(p: PatternPiece): string[] {
  const out: string[] = [];
  for (const [name, mm] of Object.entries(p.allowances ?? {}))
    if (mm !== p.seamAllowanceMm)
      out.push(`${EDGE_LABELS[name] ?? name.replaceAll('_', ' ')} ${mm} mm`);
  if (p.foldLine) out.push('fold edge 0 mm');
  return out;
}

function dedupe<T extends { area: string; item: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.area}|${r.item}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Generic sewing order when no AI draft is available. */
function defaultSteps(state: GarmentDesignState): TechPackDocument['construction']['steps'] {
  const has = (t: string) => state.components.some((c) => c.componentType === t);
  const steps: TechPackDocument['construction']['steps'] = [
    {
      title: 'Cut all pieces',
      details:
        'Cut every pattern piece in the listed quantities, respecting grainlines and folds; fuse interfacing where required.',
      components: [],
    },
  ];
  if (has('pocket'))
    steps.push({
      title: 'Prepare and attach pockets',
      details:
        'Press pocket edges, hem the opening, topstitch to the panel at the marked position.',
      components: ['Pocket'],
    });
  if (has('placket'))
    steps.push({
      title: 'Construct the front placket',
      details: 'Fold and press the placket, attach to the front, topstitch.',
      components: ['Placket'],
    });
  if (has('yoke'))
    steps.push({
      title: 'Attach the yoke',
      details: 'Join back panel and fronts to the yoke.',
      components: ['Yoke'],
    });
  steps.push({
    title: 'Join shoulders',
    details: 'Sew front and back at the shoulders.',
    components: [],
  });
  if (has('collar') || has('neckline'))
    steps.push({
      title: 'Finish the neckline / attach collar',
      details: 'Assemble collar (and stand) or neck band and attach to the neckline.',
      components: ['Collar'],
    });
  if (has('sleeve'))
    steps.push({
      title: 'Set sleeves',
      details: 'Attach sleeves to the armholes, matching notches.',
      components: ['Sleeves'],
    });
  steps.push({
    title: 'Close side seams',
    details: 'Sew side seams (and sleeve underarm seams) in one pass.',
    components: [],
  });
  if (has('cuff'))
    steps.push({
      title: 'Attach cuffs',
      details: 'Assemble cuffs and attach to the sleeve openings.',
      components: ['Cuffs'],
    });
  if (has('waistband'))
    steps.push({
      title: 'Attach waistband',
      details: 'Attach the interfaced waistband and finish the closure.',
      components: ['Waistband'],
    });
  steps.push({
    title: 'Hem and finish',
    details: 'Hem the garment, make buttonholes, attach buttons, press.',
    components: [],
  });
  return steps;
}

/** Compact structured summary given to the AI text drafting (no ids, no secrets). */
export function designSummary(
  state: GarmentDesignState,
  artifacts: ReadonlyMap<string, ArtifactName>,
): unknown {
  const meta = state.metadata as Record<string, unknown>;
  return {
    garment: meta['garmentLabel'] ?? state.garmentCategory ?? state.garmentType,
    audience: meta['audience'] ?? null,
    description: meta['description'] ?? null,
    components: state.components.map((c) => ({
      name: c.displayName,
      type: c.componentType,
      side: c.side,
      values: Object.fromEntries(
        Object.entries(c.properties)
          .filter(([, pv]) => pv.value !== null)
          .map(([k, pv]) => [k, { value: valueText(pv, artifacts), status: pv.status }]),
      ),
    })),
    patternPieces: (state.patternPieces ?? []).map((p) => ({
      name: p.name,
      cut: p.cutQuantity,
      onFold: !!p.foldLine,
    })),
  };
}

/** One-paragraph description used in image prompts. */
export function designDescriptionForImages(
  state: GarmentDesignState,
  artifacts: ReadonlyMap<string, ArtifactName>,
): string {
  const meta = state.metadata as Record<string, unknown>;
  const parts = state.components
    .filter((c) => c.componentType !== 'garment_body')
    .map((c) => {
      const vals = Object.entries(c.properties)
        .filter(
          ([k, pv]) =>
            pv.value !== null &&
            (k.startsWith('construction.') ||
              k === 'appearance.color' ||
              k === 'material.fabric_ref' ||
              k === 'appearance.pattern'),
        )
        .map(([k, pv]) => `${label(k).toLowerCase()}: ${valueText(pv, artifacts)}`);
      return `${c.displayName}${vals.length ? ` (${vals.join(', ')})` : ''}`;
    });
  const fabricNames = [
    ...new Set(
      [...artifacts.values()]
        .filter((a) => a.category === 'fabric')
        .map((a) => `${a.name}${a.color ? ` ${a.color}` : ''}`),
    ),
  ];
  return [
    `${meta['garmentLabel'] ?? state.garmentCategory ?? state.garmentType}${meta['audience'] && meta['audience'] !== 'unknown' ? ` for ${meta['audience']}` : ''}.`,
    typeof meta['description'] === 'string' ? meta['description'] : '',
    parts.length ? `Components: ${parts.join('; ')}.` : '',
    fabricNames.length ? `Fabrics: ${fabricNames.join('; ')} (reference images attached).` : '',
  ]
    .filter(Boolean)
    .join(' ');
}
