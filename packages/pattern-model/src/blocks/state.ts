import {
  allowedPropertyKeys,
  createComponentId,
  createPatternPieceId,
  defaultCatalog,
  type DesignComponent,
  type DesignSource,
  designComponentSchema,
  type GarmentDesignState,
  missingValue,
  type PatternPiece,
  patternPieceSchema,
  type PatternSpec,
  type RandomBytes,
  SCHEMA_VERSION,
} from '@ai-designer/garment-model';

import { attachPath, scalePiece } from '../cad/path.js';
import { layoutCanvas } from '../cut.js';

import type { PatternDraft } from './draft-pattern.js';
import { edgeLength, type P } from './geom.js';

/**
 * Pattern draft → design state (ADR-058). Components are the garment parts (front, back,
 * sleeves, collar…), tagged `part:<key>` so a redraft keeps their ids; pieces keep their ids by
 * template. Pieces edited by hand (`source: user`) are kept unless the caller asks to redraft them.
 */

export interface DraftToStateOptions {
  randomBytes?: RandomBytes;
  /** Replace hand-edited pieces too (default false: keep them). */
  redraftEdited?: boolean;
}

export interface DraftToStateResult {
  components: DesignComponent[];
  patternPieces: PatternPiece[];
  /** Names of hand-edited pieces that were kept (not redrafted). */
  kept: string[];
}

const PART_TAG = 'part:';
const partKey = (c: DesignComponent) =>
  c.tags.find((t) => t.startsWith(PART_TAG))?.slice(PART_TAG.length) ?? null;

export function draftToState(
  prev: Pick<GarmentDesignState, 'components' | 'patternPieces'> | null,
  draft: PatternDraft,
  opts: DraftToStateOptions = {},
): DraftToStateResult {
  const rb = opts.randomBytes;
  const prevComponents = prev?.components ?? [];
  const prevPieces = prev?.patternPieces ?? [];
  const root =
    prevComponents.find(
      (c) => c.parentComponentId === null && c.componentType === 'garment_body',
    ) ?? makeComponent(createComponentId(rb), 'garment_body', draft.rootName, null, 'none', 'body');
  const rootOut = { ...root, displayName: root.displayName || draft.rootName };
  const ids = new Map<string, string>([['body', rootOut.componentId]]);
  const byKey = new Map(prevComponents.map((c) => [partKey(c), c] as const));
  const components: DesignComponent[] = [rootOut];
  for (const part of draft.parts) {
    const existing = byKey.get(part.key);
    const id = existing?.componentId ?? createComponentId(rb);
    ids.set(part.key, id);
  }
  for (const part of draft.parts) {
    const existing = byKey.get(part.key);
    const parentId = ids.get(part.parentKey) ?? rootOut.componentId;
    const base = makeComponent(
      ids.get(part.key)!,
      part.componentType,
      part.name,
      parentId,
      part.side,
      part.key,
    );
    components.push(
      existing && existing.componentType === part.componentType
        ? { ...existing, displayName: part.name, parentComponentId: parentId, side: part.side }
        : base,
    );
  }
  // Components the user added outside the pattern parts stay.
  for (const c of prevComponents)
    if (c !== root && !partKey(c) && !components.some((x) => x.componentId === c.componentId))
      components.push(c);

  const prevByTemplate = new Map(
    prevPieces.filter((p) => p.draft?.template).map((p) => [p.draft!.template, p]),
  );
  const pieces: PatternPiece[] = [];
  const kept: string[] = [];
  // Sleeves finished by a cuff or band are seamed to it: their hem takes the seam allowance.
  const sleeveFinished = new Set(
    draft.parts.flatMap((p) =>
      p.pieces
        .filter((d) => /(^|\.)(cuff|sleeve_band|rib_cuff)$/.test(d.template))
        .map((d) => garmentPrefix(d.template)),
    ),
  );
  for (const part of draft.parts) {
    const componentId = ids.get(part.key)!;
    for (const d of part.pieces) {
      const old = prevByTemplate.get(d.template);
      if (old && old.source === 'user' && !opts.redraftEdited) {
        pieces.push({ ...old, componentId });
        kept.push(old.name);
        continue;
      }
      pieces.push(
        withFittedPath({
          pieceId: old?.pieceId ?? createPatternPieceId(rb),
          componentId,
          name: d.name,
          outline: d.outline,
          seamAllowanceMm: draft.spec.seamAllowanceMm,
          grainline: d.grainline,
          foldLine: d.foldLine,
          notches: d.notches,
          cutQuantity: d.cutQuantity,
          mirrored: d.mirrored,
          fabricRole: d.fabricRole,
          source: 'generated',
          status: old?.status === 'confirmed' ? 'needs_review' : 'provisional',
          draft: { method: 'parametric', template: d.template, inputs: d.inputs },
          notes: d.notes.slice(0, 20),
          edges: d.edges,
          markings: d.markings,
          ...mergeAllowances(
            {
              allowances: {
                ...hemAllowances(
                  d.template,
                  d.edges,
                  draft.spec.hemAllowanceMm,
                  sleeveFinished.has(garmentPrefix(d.template)),
                ).allowances,
                ...d.allowances,
              },
            },
            old?.allowances,
          ),
          ...(old?.canvas ? { canvas: old.canvas } : {}),
        }),
      );
    }
  }
  const layout = layoutCanvas(pieces);
  const placed = pieces.map((p) => (p.canvas ? p : { ...p, canvas: layout.get(p.pieceId)! }));
  return { components, patternPieces: placed, kept };
}

/** Garment of a piece in a set (`shorts.waistband` → `shorts`; main garment → ''). */
const garmentPrefix = (template: string) =>
  template.includes('.') ? template.slice(0, template.indexOf('.')) : '';

/** Per-seam allowances set by hand survive a redraft; hems follow the spec's hem allowance. */
function mergeAllowances(
  drafted: { allowances?: Record<string, number> },
  old: Record<string, number> | undefined,
): { allowances?: Record<string, number> } {
  const kept = Object.fromEntries(
    Object.entries(old ?? {}).filter(([k]) => k !== 'hem' && k !== 'hem_ext'),
  );
  const all = { ...kept, ...drafted.allowances };
  for (const k of Object.keys(all)) if (all[k] === undefined) delete all[k];
  return Object.keys(all).length ? { allowances: all } : {};
}

/** Garment hems get the hem allowance (ADR-060); seams joined to a cuff or band keep the SA. */
function hemAllowances(
  template: string,
  edges: readonly { name: string }[],
  hemMm: number | undefined,
  sleeveFinished: boolean,
): { allowances?: Record<string, number> } {
  if (hemMm === undefined) return {};
  const base = template.slice(template.lastIndexOf('.') + 1);
  if (base === 'sleeve' && sleeveFinished) return {};
  // Bands, facings, ruffles, tiers above the last, pockets: their "hem" is a seam or a fold.
  if (!/^(front|back|bodice_|skirt_|trouser_|sleeve|frock_|tier_|lining_)/.test(base)) return {};
  const names = edges.map((e) => e.name).filter((n) => n === 'hem' || n === 'hem_ext');
  if (!names.length) return {};
  return { allowances: Object.fromEntries(names.map((n) => [n, hemMm])) };
}

function makeComponent(
  componentId: string,
  componentType: string,
  displayName: string,
  parentComponentId: string | null,
  side: 'none' | 'center',
  key: string,
): DesignComponent {
  const properties: DesignComponent['properties'] = {};
  for (const k of allowedPropertyKeys(defaultCatalog, componentType))
    properties[k] = missingValue();
  return designComponentSchema.parse({
    componentId,
    componentType,
    displayName,
    parentComponentId,
    side,
    properties,
    tags: [`${PART_TAG}${key}`, 'pattern'],
  });
}

/** Parses a drafted piece and gives it its editable Bézier path (fitted from the outline). */
function withFittedPath(input: unknown): PatternPiece {
  return attachPath(patternPieceSchema.parse(input));
}

/** A complete new pattern-first design state. */
export function patternDesignState(
  draft: PatternDraft,
  input: { sources?: DesignSource[]; createdFrom?: 'ai' | 'user'; randomBytes?: RandomBytes },
): GarmentDesignState {
  const { components, patternPieces } = draftToState(null, draft, {
    randomBytes: input.randomBytes,
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    garmentType: draft.garmentType,
    garmentCategory: draft.category,
    components,
    relationships: [],
    constraints: [],
    annotationsRef: null,
    metadata: {},
    provenance: {
      createdFrom: input.createdFrom ?? 'ai',
      templateKey: null,
      sourceRevisionId: null,
    },
    patternSpec: draft.spec as PatternSpec,
    patternPieces,
    ...(input.sources?.length ? { sources: input.sources } : {}),
  };
}

// ── manual edits ─────────────────────────────────────────────────────────────

/** Resizes a piece to a width and/or height (mm) from its top-left; marks it edited by hand. */
export function resizePiece(
  piece: PatternPiece,
  size: { width?: number; height?: number },
): PatternPiece {
  const xs = piece.outline.map((p) => p.x);
  const ys = piece.outline.map((p) => p.y);
  const w = Math.max(1, Math.max(...xs) - Math.min(...xs));
  const h = Math.max(1, Math.max(...ys) - Math.min(...ys));
  const sx = size.width && size.width > 0 ? size.width / w : 1;
  const sy = size.height && size.height > 0 ? size.height / h : 1;
  return scalePiece(piece, sx, sy);
}

export const EDGE_LABELS: Record<string, string> = {
  neck: 'neckline',
  neck_ext: 'extension',
  shoulder: 'shoulder',
  armhole: 'armhole',
  side: 'side seam',
  waist: 'waist',
  hem: 'hem',
  cf: 'centre front',
  cb: 'centre back',
  front_edge: 'front edge',
  facing: 'facing',
  cap: 'sleeve cap',
  underarm_front: 'underarm',
  underarm_back: 'underarm',
  seam: 'yoke seam',
  crotch: 'crotch',
  inseam: 'inseam',
  outseam: 'outseam',
  long: 'length',
  top: 'top',
  outer: 'outer edge',
  front: 'front edge',
  ext: 'extension',
};

export interface PieceDimensions {
  width: number;
  height: number;
  edges: { name: string; label: string; length: number; intake: number; mid: P }[];
}

/** Bounding size and named edge lengths of a piece (shown on the pattern). */
export function pieceDimensions(piece: Pick<PatternPiece, 'outline' | 'edges'>): PieceDimensions {
  const xs = piece.outline.map((p) => p.x);
  const ys = piece.outline.map((p) => p.y);
  const edges = (piece.edges ?? [])
    .filter((e) => e.from < piece.outline.length && e.to < piece.outline.length)
    .map((e) => {
      const n = piece.outline.length;
      let i = e.from;
      const pts: P[] = [piece.outline[i]!];
      for (let guard = 0; i !== e.to && guard < n; guard++) {
        i = (i + 1) % n;
        pts.push(piece.outline[i]!);
      }
      const mid = pts[Math.floor(pts.length / 2)]!;
      return {
        name: e.name,
        label: EDGE_LABELS[e.name] ?? e.name.replaceAll('_', ' '),
        length: Math.round(edgeLength(piece.outline, e)),
        intake: Math.round(e.intakeMm),
        mid,
      };
    });
  return {
    width: Math.round(Math.max(...xs) - Math.min(...xs)),
    height: Math.round(Math.max(...ys) - Math.min(...ys)),
    edges,
  };
}

/** Outline indices worth a handle: edge ends and sharp corners. */
export function keyPoints(piece: Pick<PatternPiece, 'outline' | 'edges'>): number[] {
  const n = piece.outline.length;
  const out = new Set<number>();
  for (const e of piece.edges ?? []) {
    if (e.from < n) out.add(e.from);
    if (e.to < n) out.add(e.to);
  }
  for (let i = 0; i < n; i++) {
    const a = piece.outline[(i - 1 + n) % n]!;
    const b = piece.outline[i]!;
    const c = piece.outline[(i + 1) % n]!;
    const t1 = Math.atan2(b.y - a.y, b.x - a.x);
    const t2 = Math.atan2(c.y - b.y, c.x - b.x);
    let turn = Math.abs(t2 - t1);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if (turn > (35 * Math.PI) / 180) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

/**
 * Moves one outline point; the points of the edges meeting there follow with a falloff along each
 * edge (curves stay smooth, the far ends stay put). Marks the piece edited by hand.
 */
export function moveKeyPoint(
  piece: PatternPiece,
  index: number,
  dx: number,
  dy: number,
): PatternPiece {
  const n = piece.outline.length;
  const outline = piece.outline.map((p) => ({ ...p }));
  const weights = new Map<number, number>([[index, 1]]);
  const walk = (start: number, end: number, forward: boolean) => {
    const pts: number[] = [];
    let i = start;
    for (let guard = 0; guard < n; guard++) {
      pts.push(i);
      if (i === end) break;
      i = forward ? (i + 1) % n : (i - 1 + n) % n;
    }
    let total = 0;
    const cum = [0];
    for (let k = 1; k < pts.length; k++) {
      total += Math.hypot(
        piece.outline[pts[k]!]!.x - piece.outline[pts[k - 1]!]!.x,
        piece.outline[pts[k]!]!.y - piece.outline[pts[k - 1]!]!.y,
      );
      cum.push(total);
    }
    for (let k = 1; k < pts.length - 1; k++) {
      const w = 1 - cum[k]! / Math.max(1e-6, total);
      weights.set(pts[k]!, Math.max(weights.get(pts[k]!) ?? 0, w));
    }
  };
  for (const e of piece.edges ?? []) {
    if (e.from === index && e.to !== index) walk(index, e.to, true);
    if (e.to === index && e.from !== index) walk(index, e.from, false);
  }
  for (const [i, w] of weights) {
    outline[i] = {
      x: Math.round((outline[i]!.x + dx * w) * 10) / 10,
      y: Math.round((outline[i]!.y + dy * w) * 10) / 10,
    };
  }
  const { path: _drop, ...rest } = piece;
  void _drop;
  return { ...rest, outline, source: 'user', status: 'needs_review' };
}
