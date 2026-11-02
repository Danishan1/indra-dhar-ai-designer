import {
  defaultCatalog,
  isEnumValueAllowed,
  type PatternPiece,
  type PropertyValue,
} from '@ai-designer/garment-model';

/**
 * Component library reuse (ADR-056). A newly identified component is compared with library entries
 * on its **type, construction attributes and rough dimensions** — never on its name alone. The
 * result says whether the AI detail pass can be skipped (exact or compatible) or not.
 */

export type MatchKind = 'exact' | 'compatible' | 'similar' | 'new';

export interface LibraryEntry {
  artifactId: string;
  artifactRevisionId: string;
  displayId: string;
  name: string;
  category: string;
  componentType: string;
  attributes: Record<string, string>;
  dimensionsMm: Record<string, number>;
  patternPieces: PatternPiece[];
  previewUrl: string | null;
  description: string;
  constructionNotes: string[];
  /** Visual property values the entry states (applied as proposals when used). */
  visual: Record<string, PropertyValue>;
}

export interface MatchResult {
  kind: MatchKind;
  score: number;
  entry: LibraryEntry | null;
  /** Human reasons ("same collar type", "length differs by 12 %"). */
  reasons: string[];
}

/** Attribute names ↔ property keys of the catalog. */
export const ATTRIBUTE_PROPERTY: Record<string, string> = {
  sleeve_type: 'construction.sleeve_type',
  cuff_type: 'construction.cuff_type',
  collar_type: 'construction.collar_type',
  neckline_type: 'construction.neckline_type',
  placket_type: 'construction.placket_type',
  closure_type: 'construction.closure_type',
  button_count: 'construction.button_count',
  pocket_type: 'construction.pocket_type',
  hem_type: 'construction.hem_type',
  seam_type: 'construction.seam_type',
  silhouette: 'appearance.silhouette',
  pattern: 'appearance.pattern',
  pocket_position: 'placement.pocket_position',
};

export const MEASUREMENT_PROPERTY: Record<string, string> = {
  body_length: 'dimension.body_length',
  chest_width: 'dimension.chest_width',
  shoulder_width: 'dimension.shoulder_width',
  sleeve_length: 'dimension.sleeve_length',
  cuff_width: 'dimension.cuff_width',
  collar_height: 'dimension.collar_height',
  collar_stand_height: 'dimension.collar_stand_height',
  neckline_width: 'dimension.neckline_width',
  placket_width: 'dimension.placket_width',
  hem_depth: 'dimension.hem_depth',
  waist_width: 'dimension.waist_width',
  hip_width: 'dimension.hip_width',
  inseam: 'dimension.inseam',
  leg_opening: 'dimension.leg_opening',
  skirt_length: 'dimension.skirt_length',
  waistband_height: 'dimension.waistband_height',
};

/** Common words models use → catalog values. */
const SYNONYMS: Record<string, Record<string, string>> = {
  cuff_type: {
    barrel: 'barrel_single_button',
    single_button: 'barrel_single_button',
    double_button: 'barrel_double_button',
    ribbed: 'rib',
  },
  closure_type: { buttons: 'button', snaps: 'snap', zipper: 'zip', zip_fly: 'zip' },
  placket_type: { hidden: 'concealed', fly_front: 'concealed' },
  pocket_type: { flap: 'patch_with_flap', patch_flap: 'patch_with_flap', side_seam: 'inseam' },
  collar_type: {
    notched: 'notched_lapel',
    lapel: 'notched_lapel',
    pointed: 'point',
    stand: 'band',
  },
  neckline_type: { round: 'crew', v: 'v_neck' },
};

/** An attribute value in catalog form (null when the catalog does not know it). */
export function normalizeAttributeValue(name: string, raw: string): string | null {
  const key = ATTRIBUTE_PROPERTY[name];
  if (!key) return null;
  const v = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const value = SYNONYMS[name]?.[v] ?? v;
  const def = defaultCatalog.properties.get(key);
  if (def?.dataType === 'enum' && !isEnumValueAllowed(defaultCatalog, key, value)) return null;
  return value;
}

/** Attributes normalized to catalog values (unknown values are dropped from the signature). */
export function normalizedAttributes(attributes: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, raw] of Object.entries(attributes)) {
    const value = normalizeAttributeValue(name, raw);
    if (value !== null) out[name] = value;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Artifact category a component type is stored under in the library. */
export function libraryCategoryOf(componentType: string): string | null {
  switch (componentType) {
    case 'sleeve':
    case 'cuff':
    case 'collar':
    case 'collar_stand':
    case 'pocket':
    case 'placket':
    case 'neckline':
    case 'yoke':
    case 'waistband':
    case 'skirt_panel':
    case 'leg_panel':
    case 'hood':
      return componentType;
    case 'front_body_panel':
    case 'back_body_panel':
      return 'body_panel';
    case 'garment_body':
    case 'hem':
      return null;
    default:
      return 'component';
  }
}

export function matchComponent(
  candidate: {
    componentType: string;
    attributes: Record<string, string>;
    measurementsMm: Record<string, number>;
  },
  entries: readonly LibraryEntry[],
): MatchResult {
  const attrs = normalizedAttributes(candidate.attributes);
  let best: MatchResult = {
    kind: 'new',
    score: 0,
    entry: null,
    reasons: ['Nothing comparable in the library'],
  };
  for (const raw of entries) {
    if (raw.componentType !== candidate.componentType) continue;
    const entry = { ...raw, attributes: normalizedAttributes(raw.attributes) };
    const reasons: string[] = [];
    let agree = 0;
    let conflict = 0;
    for (const name of new Set([...Object.keys(attrs), ...Object.keys(entry.attributes)])) {
      const a = attrs[name];
      const b = entry.attributes[name];
      if (a === undefined || b === undefined) continue;
      if (a === b) {
        agree++;
        reasons.push(`same ${name.replaceAll('_', ' ')} (${a.replaceAll('_', ' ')})`);
      } else {
        conflict++;
        reasons.push(`${name.replaceAll('_', ' ')} differs (${a} vs ${b})`);
      }
    }
    const dimKeys = Object.keys(candidate.measurementsMm).filter((k) => entry.dimensionsMm[k]);
    let maxDiff = 0;
    for (const k of dimKeys) {
      const diff =
        Math.abs(candidate.measurementsMm[k]! - entry.dimensionsMm[k]!) /
        Math.max(entry.dimensionsMm[k]!, 1);
      maxDiff = Math.max(maxDiff, diff);
      if (diff > 0.1)
        reasons.push(`${k.replaceAll('_', ' ')} differs by ${Math.round(diff * 100)} %`);
    }
    // Parts without construction attributes (collar stand, yoke…) are compared on dimensions.
    const geometryOnly =
      Object.keys(attrs).length === 0 &&
      Object.keys(entry.attributes).length === 0 &&
      dimKeys.length > 0;
    const attrKeysSame =
      (Object.keys(attrs).length > 0 || geometryOnly) &&
      Object.keys(attrs).length === Object.keys(entry.attributes).length &&
      conflict === 0;
    const kind: MatchKind =
      attrKeysSame && maxDiff <= 0.05
        ? 'exact'
        : conflict === 0 && (agree > 0 || geometryOnly) && maxDiff <= 0.15
          ? 'compatible'
          : conflict <= 1
            ? 'similar'
            : 'new';
    const score =
      (kind === 'exact' ? 3 : kind === 'compatible' ? 2 : kind === 'similar' ? 1 : 0) +
      agree * 0.1 -
      maxDiff;
    if (kind !== 'new' && score > best.score) best = { kind, score, entry: raw, reasons };
  }
  return best;
}

/** True when the AI detail pass may be skipped (the library entry is suitable as it is). */
export const skipsAiDetail = (kind: MatchKind) => kind === 'exact' || kind === 'compatible';

/** What the worker reads from an artifact (current revision) to compare it with new components. */
export interface ArtifactForMatching {
  artifactId: string;
  artifactRevisionId: string;
  displayId: string;
  name: string;
  category: string;
  artifactType: string;
  description: string | null;
  definition: Record<string, unknown>;
  properties: { visual?: Record<string, PropertyValue> } | null;
  previewUrl?: string | null;
}

/**
 * A library entry from an artifact: entries saved by the analyzer carry a `matchSignature`; built-in
 * and hand-made artifacts are described by their stated construction properties and target type.
 * Fabrics, trims and other non-component artifacts give null.
 */
export function libraryEntryFromArtifact(a: ArtifactForMatching): LibraryEntry | null {
  const def = a.definition;
  const sig = def['matchSignature'] as
    | {
        componentType: string;
        attributes?: Record<string, string>;
        dimensionsMm?: Record<string, number>;
      }
    | undefined;
  const targets = Array.isArray(def['compatibleTargetTypes'])
    ? (def['compatibleTargetTypes'] as string[])
    : [];
  const componentType = sig?.componentType ?? (targets.length === 1 ? targets[0] : null) ?? null;
  if (!componentType || libraryCategoryOf(componentType) === null) return null;
  if (['fabric', 'lace', 'trim', 'embroidery', 'button', 'artwork'].includes(a.category))
    return null;
  const visual = a.properties?.visual ?? {};
  const attributes: Record<string, string> = { ...(sig?.attributes ?? {}) };
  const dimensionsMm: Record<string, number> = { ...(sig?.dimensionsMm ?? {}) };
  for (const [name, key] of Object.entries(ATTRIBUTE_PROPERTY)) {
    const v = visual[key]?.value;
    if (attributes[name] === undefined && (typeof v === 'string' || typeof v === 'number'))
      attributes[name] = String(v);
  }
  for (const [name, key] of Object.entries(MEASUREMENT_PROPERTY)) {
    const v = visual[key]?.value;
    if (dimensionsMm[name] === undefined && typeof v === 'number') dimensionsMm[name] = v;
  }
  const details = def['details'] as
    { description?: string; constructionNotes?: string[] } | undefined;
  return {
    artifactId: a.artifactId,
    artifactRevisionId: a.artifactRevisionId,
    displayId: a.displayId,
    name: a.name,
    category: a.category,
    componentType,
    attributes: normalizedAttributes(attributes),
    dimensionsMm,
    patternPieces: Array.isArray(def['patternPieces'])
      ? (def['patternPieces'] as PatternPiece[])
      : [],
    previewUrl: a.previewUrl ?? null,
    description: details?.description ?? a.description ?? '',
    constructionNotes: details?.constructionNotes ?? [],
    visual,
  };
}
