import {
  allowedPropertyKeys,
  createBindingId,
  createComponentId,
  createPatternPieceId,
  defaultCatalog,
  type DesignComponent,
  type DesignSource,
  type GarmentDesignState,
  isEnumValueAllowed,
  missingValue,
  type PatternPiece,
  type PropertyValue,
  type RandomBytes,
  SCHEMA_VERSION,
} from '@ai-designer/garment-model';
import { draftComponentPieces, pieceFromNormalizedOutline } from '@ai-designer/pattern-model';

import type {
  AnalysisComponent,
  ComponentDetails,
  Decomposition,
  InputRole,
} from './analysis-schema.js';
import {
  ATTRIBUTE_PROPERTY,
  type LibraryEntry,
  MEASUREMENT_PROPERTY,
  normalizeAttributeValue,
} from './library-match.js';
import { type ImageSize, observedShapes, reconstructShapes } from './reconstruct.js';
import { repairDesignState } from './repair.js';

/**
 * Analysis → canonical garment state (ADR-056). Everything the AI said is stored as `inferred`
 * (source `ai_interpretation`, review required); library values as `proposed` (source artifact);
 * the user's fabric choice as `confirmed`. Nothing AI-made is ever confirmed (rule 3).
 */

export interface SourceImage {
  index: number;
  assetId: string;
  role: InputRole;
  label: string | null;
}

export interface FabricChoice {
  artifactId: string;
  artifactRevisionId: string;
  name: string;
  color: string | null;
}

export type ComponentDecision =
  { use: 'ai' } | { use: 'library'; entry: LibraryEntry } | { use: 'skip' };

export interface BuildInput {
  analysisId: string;
  analysis: Decomposition;
  details?: ComponentDetails | null;
  sources: readonly SourceImage[];
  /** Crop asset per component key (visual representation). */
  crops?: Readonly<Record<string, string>>;
  decisions?: Readonly<Record<string, ComponentDecision>>;
  fabrics?: Readonly<Record<string, FabricChoice>>;
  /** component key → fabric key (overrides the AI suggestion; null = none). */
  fabricAssignments?: Readonly<Record<string, string | null>>;
  actor: { userId: string; now: string };
  randomBytes?: RandomBytes;
  /** Pixel size per input image index (for the reconstruction scale). */
  imageSizes?: readonly (ImageSize | null)[];
}

export interface BuildResult {
  state: GarmentDesignState;
  /** component key → component id */
  componentIds: Record<string, string>;
  notes: string[];
  /** Blocking problems the repair could not resolve (empty when the state is valid). */
  problems: string[];
}

const aiValue = (
  value: NonNullable<PropertyValue['value']>,
  unit: PropertyValue['unit'],
  analysisId: string,
  confidence: number,
  note: string | null,
): PropertyValue => ({
  value,
  unit,
  status: 'inferred',
  sourceType: 'ai_interpretation',
  sourceRefs: [{ sourceType: 'ai_interpretation', entityId: analysisId, revisionId: null, note }],
  confidence: Math.round(confidence * 100) / 100,
  reviewRequired: true,
  confirmedBy: null,
  confirmedAt: null,
});

const BODY_TYPES = new Set(['garment_body']);

/** A catalog type the parent can hold, else `custom` (keeps every identified part). */
function placeableType(type: string, parentType: string | null): string {
  const def = defaultCatalog.componentTypes.get(type);
  if (!def) return 'custom';
  if (parentType === null) return def.rootAllowed ? type : type;
  if (def.allowedParents === '*' || def.allowedParents.includes(parentType)) return type;
  return 'custom';
}

export function buildDesignState(input: BuildInput): BuildResult {
  const { analysis } = input;
  const notes: string[] = [];
  const decisions = input.decisions ?? {};
  const details = new Map((input.details?.details ?? []).map((d) => [d.key, d]));
  const category = analysis.garment.category === 'other' ? null : analysis.garment.category;
  const garmentType = category
    ? (defaultCatalog.categories.get(category)?.garmentType ?? 'other')
    : 'other';

  // Root body first.
  let parts: AnalysisComponent[] = analysis.components.filter(
    (c) => decisions[c.key]?.use !== 'skip',
  );
  let root = parts.find((c) => BODY_TYPES.has(c.componentType));
  if (!root) {
    root = {
      key: 'body',
      componentType: 'garment_body',
      name: analysis.garment.label.slice(0, 120),
      side: 'none',
      parentKey: null,
      description: analysis.garment.description.slice(0, 1000),
      attributes: {},
      measurementsMm: {},
      measurementSource: 'estimated',
      region: null,
      outline: null,
      view: null,
      details: [],
      fabricKey: null,
      confidence: analysis.garment.confidence,
    };
    parts = [root, ...parts];
  }
  const rootKey = root.key;
  // Unique keys.
  const seen = new Set<string>();
  parts = parts.map((c) => {
    let key = c.key;
    for (let i = 2; seen.has(key); i++) key = `${c.key}_${i}`;
    seen.add(key);
    return key === c.key ? c : { ...c, key };
  });
  const byKey = new Map(parts.map((c) => [c.key, c]));
  const ids: Record<string, string> = {};
  for (const c of parts) ids[c.key] = createComponentId(input.randomBytes);

  const components: DesignComponent[] = [];
  const typeOf = new Map<string, string>();
  // Parents before children: walk from the root.
  const ordered: AnalysisComponent[] = [];
  const visit = (c: AnalysisComponent, depth: number) => {
    if (ordered.includes(c) || depth > 8) return;
    ordered.push(c);
    for (const child of parts)
      if (child !== c && (child.parentKey ?? rootKey) === c.key) visit(child, depth + 1);
  };
  visit(root, 0);
  for (const c of parts) if (!ordered.includes(c)) ordered.push(c);

  for (const c of ordered) {
    const isRoot = c.key === rootKey;
    const parentKey = isRoot
      ? null
      : c.parentKey && byKey.has(c.parentKey) && c.parentKey !== c.key
        ? c.parentKey
        : rootKey;
    const parentType = parentKey ? (typeOf.get(parentKey) ?? 'garment_body') : null;
    const requested = isRoot
      ? 'garment_body'
      : c.componentType === 'garment_body'
        ? 'custom'
        : c.componentType;
    let type = placeableType(requested, parentType);
    let parentId = parentKey ? ids[parentKey]! : null;
    if (type === 'custom' && requested !== 'custom' && parentKey !== rootKey) {
      // Try the body as parent before giving up on the type.
      const viaBody = placeableType(requested, 'garment_body');
      if (viaBody !== 'custom') {
        type = viaBody;
        parentId = ids[rootKey]!;
      }
    }
    if (type === 'custom' && requested !== 'custom')
      notes.push(
        `${c.name}: "${requested.replaceAll('_', ' ')}" cannot sit there, kept as a custom component`,
      );
    typeOf.set(c.key, type);

    const allowed = new Set(allowedPropertyKeys(defaultCatalog, type));
    const properties: Record<string, PropertyValue> = {};
    for (const key of allowed) properties[key] = missingValue();
    const decision = decisions[c.key];
    const detail = details.get(c.key);
    const attributes = { ...c.attributes, ...(detail?.attributes ?? {}) };
    const measurements = { ...c.measurementsMm, ...(detail?.measurementsMm ?? {}) };
    const note = c.description ? c.description.slice(0, 200) : null;

    for (const [name, raw] of Object.entries(attributes)) {
      const key = ATTRIBUTE_PROPERTY[name];
      if (!key || !allowed.has(key)) continue;
      const def = defaultCatalog.properties.get(key);
      if (!def) continue;
      if (def.dataType === 'enum') {
        const v = normalizeAttributeValue(name, raw);
        if (v !== null && isEnumValueAllowed(defaultCatalog, key, v))
          properties[key] = aiValue(v, null, input.analysisId, c.confidence, note);
      } else if (def.dataType === 'number') {
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0)
          properties[key] = aiValue(Math.round(n), null, input.analysisId, c.confidence, note);
      }
    }
    for (const [name, mm] of Object.entries(measurements)) {
      const key = MEASUREMENT_PROPERTY[name];
      if (!key || !allowed.has(key) || !(mm > 0)) continue;
      properties[key] = aiValue(
        Math.round(mm),
        'mm',
        input.analysisId,
        Math.min(c.confidence, 0.5),
        c.measurementSource === 'pattern'
          ? 'read from the uploaded pattern'
          : 'estimated from images',
      );
    }

    const bindings: DesignComponent['artifactBindings'] = [];
    if (decision?.use === 'library') {
      const entry = decision.entry;
      bindings.push({
        bindingId: createBindingId(input.randomBytes),
        artifactId: entry.artifactId,
        artifactRevisionId: entry.artifactRevisionId,
        role: entry.category,
      });
      for (const [key, pv] of Object.entries(entry.visual)) {
        if (!allowed.has(key) || pv.value === null) continue;
        properties[key] = {
          ...pv,
          status: 'proposed',
          sourceType: 'artifact_revision',
          sourceRefs: [
            {
              sourceType: 'artifact_revision',
              entityId: entry.artifactId,
              revisionId: entry.artifactRevisionId,
              note: entry.name,
            },
          ],
          reviewRequired: true,
          confirmedBy: null,
          confirmedAt: null,
        };
      }
    }

    // Fabric: the user's assignment is a confirmed choice.
    const fabricKey =
      input.fabricAssignments && c.key in input.fabricAssignments
        ? input.fabricAssignments[c.key]
        : c.fabricKey;
    const fabric = fabricKey ? input.fabrics?.[fabricKey] : undefined;
    if (fabric && allowed.has('material.fabric_ref')) {
      properties['material.fabric_ref'] = {
        value: {
          entityType: 'artifact_revision',
          entityId: fabric.artifactRevisionId,
          revisionId: fabric.artifactRevisionId,
        },
        unit: null,
        status: 'confirmed',
        sourceType: 'user_input',
        sourceRefs: [
          { sourceType: 'user_input', entityId: null, revisionId: null, note: fabric.name },
        ],
        confidence: null,
        reviewRequired: false,
        confirmedBy: input.actor.userId,
        confirmedAt: input.actor.now,
      };
      bindings.push({
        bindingId: createBindingId(input.randomBytes),
        artifactId: fabric.artifactId,
        artifactRevisionId: fabric.artifactRevisionId,
        role: 'fabric',
      });
      if (
        fabric.color &&
        allowed.has('appearance.color') &&
        properties['appearance.color']?.value == null
      )
        properties['appearance.color'] = {
          value: fabric.color,
          unit: null,
          status: 'proposed',
          sourceType: 'artifact_revision',
          sourceRefs: [
            {
              sourceType: 'artifact_revision',
              entityId: fabric.artifactId,
              revisionId: fabric.artifactRevisionId,
              note: fabric.name,
            },
          ],
          confidence: null,
          reviewRequired: true,
          confirmedBy: null,
          confirmedAt: null,
        };
    }

    const source = c.region
      ? input.sources.find((s) => s.index === c.region!.imageIndex)
      : undefined;
    const crop = input.crops?.[c.key];
    components.push({
      componentId: ids[c.key]!,
      componentType: type,
      displayName: c.name.slice(0, 120),
      parentComponentId: parentId,
      side: c.side === 'left' || c.side === 'right' ? c.side : 'none',
      properties,
      artifactBindings: bindings,
      geometryRefs: [],
      assetRefs: crop ? [{ assetId: crop, role: 'visual' }] : [],
      tags: ['ai'],
      ...(source && c.region
        ? {
            sourceRegion: {
              assetId: source.assetId,
              x: c.region.x,
              y: c.region.y,
              width: Math.min(c.region.width, 1 - c.region.x),
              height: Math.min(c.region.height, 1 - c.region.y),
            },
          }
        : {}),
      visible: true,
      locked: false,
    });
  }

  const sources: DesignSource[] = input.sources.map((s) => ({
    assetId: s.assetId,
    role: s.role,
    label: s.label,
  }));
  const state: GarmentDesignState = {
    schemaVersion: SCHEMA_VERSION,
    garmentType,
    garmentCategory: category,
    components,
    relationships: [],
    constraints: [],
    annotationsRef: null,
    metadata: {
      garmentLabel: analysis.garment.label,
      audience: analysis.garment.audience,
      description: analysis.garment.description,
      ...(analysis.garment.silhouette ? { silhouette: analysis.garment.silhouette } : {}),
      analysisId: input.analysisId,
      missingInformation: analysis.missingInformation,
    },
    provenance: { createdFrom: 'ai', templateKey: null, sourceRevisionId: null },
    sources,
  };

  // Pattern pieces: extracted (uploaded pattern) > library > parametric draft.
  const pieces: PatternPiece[] = [];
  const extractedFor = new Set<string>();
  for (const p of analysis.patternPieces) {
    const key = p.componentKey && byKey.has(p.componentKey) ? p.componentKey : null;
    if (!key) {
      notes.push(`Pattern piece "${p.name}" could not be linked to a component`);
      continue;
    }
    extractedFor.add(key);
    pieces.push(
      pieceFromNormalizedOutline({
        componentId: ids[key]!,
        name: p.name,
        points: p.outline,
        widthMm: p.widthMm ?? 200,
        heightMm: p.heightMm ?? 200,
        source: 'extracted',
        method: 'extracted_outline',
        cutQuantity: p.cutQuantity,
        notes: [
          ...(p.widthMm && p.heightMm
            ? []
            : ['No scale on the pattern image: size is a placeholder until measured.']),
          ...p.markings.map((m) => `Marking: ${m}`),
        ],
        ...(input.randomBytes ? { randomBytes: input.randomBytes } : {}),
      }),
    );
  }
  for (const c of components) {
    const key = Object.keys(ids).find((k) => ids[k] === c.componentId)!;
    if (extractedFor.has(key)) continue;
    const decision = decisions[key];
    if (decision?.use === 'library' && decision.entry.patternPieces.length) {
      for (const p of decision.entry.patternPieces)
        pieces.push({
          ...p,
          pieceId: createPatternPieceId(input.randomBytes),
          componentId: c.componentId,
          name: c.displayName,
          source: 'library',
          status: 'provisional',
        });
      continue;
    }
    const drafted = draftComponentPieces(
      state,
      c,
      input.randomBytes ? { randomBytes: input.randomBytes } : {},
    );
    const sa = details.get(key)?.seamAllowanceMm;
    pieces.push(...drafted.map((p) => (sa ? { ...p, seamAllowanceMm: sa } : p)));
  }
  state.patternPieces = pieces;

  // Editable reconstruction: vector shapes per component (observed outline > template > box).
  const observed = input.imageSizes
    ? observedShapes({
        decomposition: analysis,
        imageSizes: input.imageSizes,
        componentIds: ids,
        viewOf: (i) =>
          analysis.inputs.find((x) => x.index === i)?.notes.match(/\bback\b/i) ? 'back' : 'front',
      })
    : null;
  const recon = reconstructShapes(state, observed);
  if (observed && state.sources)
    state.sources = state.sources.map((src, k) => {
      const placement = observed.placements.get(input.sources[k]!.index);
      return placement ? { ...src, placement } : src;
    });
  if (recon.inferred)
    notes.push(
      `${recon.inferred} part(s) had no traced outline and start as simple shapes — reshape them in the editor`,
    );
  // Parts without a drafting rule get a provisional piece from their traced outline.
  for (const c of state.components) {
    if (pieces.some((p) => p.componentId === c.componentId)) continue;
    if (
      ['garment_body', 'neckline', 'hem', 'front_body_panel', 'back_body_panel'].includes(
        c.componentType,
      )
    )
      continue;
    const shape = c.shapes?.find((x) => x.view === 'front' && x.source === 'observed');
    if (!shape) continue;
    pieces.push(
      pieceFromNormalizedOutline({
        componentId: c.componentId,
        name: c.displayName,
        points: shape.path,
        widthMm: shape.width,
        heightMm: shape.height,
        source: 'inferred',
        method: 'ai_outline',
        ...(input.randomBytes ? { randomBytes: input.randomBytes } : {}),
      }),
    );
  }
  state.patternPieces = pieces;

  // Keep the result structurally valid: resolve anything the validator refuses (never block the user).
  const repaired = repairDesignState(state, input.randomBytes);
  notes.push(...repaired.notes);
  return {
    state: repaired.state,
    componentIds: ids,
    notes,
    problems: repaired.remaining.map((f) => f.message),
  };
}
