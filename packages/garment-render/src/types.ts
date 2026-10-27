/**
 * Scene model of the parametric 2D renderer (I16, ADR-024/051). A scene is plain, serializable data:
 * the web canvas renders it with React, the worker turns it into an SVG string (I35).
 *
 * Coordinates: `design_2d`, millimetres, origin at the centre-front neck point, x to the viewer's
 * right, y down (see README).
 */
export type View = 'front' | 'back';
export const VIEWS: readonly View[] = ['front', 'back'];

/** Geometry capability classes (SPEC-010 §10). This renderer produces structured parametric G2. */
export type GeometryCapability = 'G0' | 'G2';

export type Layer = 'garment' | 'trims' | 'artwork' | 'guides';
export const LAYERS: readonly Layer[] = ['garment', 'trims', 'artwork', 'guides'];

/** Line/fill roles (FR-RV-028). The style table maps them to strokes and dashes. */
export type ElementRole =
  | 'panel' // filled area of a component
  | 'silhouette' // outer garment outline
  | 'seam' // seam line
  | 'stitch' // topstitch (dashed)
  | 'fold' // fold line
  | 'hidden' // hidden / inside edge
  | 'detail' // buttons, rib lines, small details
  | 'trim' // trims following a boundary
  | 'approximate' // labelled approximation (no reliable geometry)
  | 'artwork' // artwork / embroidery placeholder
  | 'guide'; // centre line and other guides

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SceneElement {
  /** Stable, deterministic element id (unique within the scene). */
  id: string;
  /** Canonical component this element belongs to (selection, hit-testing). */
  componentId: string | null;
  /** Relationship that produced it (trims, artwork). */
  relationshipId: string | null;
  view: View;
  layer: Layer;
  role: ElementRole;
  /** SVG path data in mm. */
  d: string;
  /** Fill reference: a colour (#rrggbb), `url(#pattern-id)` or `none`. */
  fill: string;
  /** Accessible label (component name, "Lace trim on Body hem"…). */
  label: string;
  /** Short visible text (e.g. "approximate"), drawn at `x`,`y`. */
  text: { x: number; y: number; value: string } | null;
}

export interface ViewScene {
  view: View;
  /** False when this view cannot be drawn honestly (FR-RV-030). */
  available: boolean;
  /** Why not, e.g. `BACK_VIEW_NOT_AVAILABLE`, `UNSUPPORTED_CATEGORY`. */
  reason: string | null;
  bounds: Bounds;
  elements: SceneElement[];
}

/** A named edge of a component that trims can follow (I18 placement uses it too). */
export interface BoundaryPath {
  name: string;
  view: View;
  points: Point[];
}

export interface ComponentRenderInfo {
  componentId: string;
  componentType: string;
  /** Drawn by this renderer (false: type not supported yet — listed, not drawn). */
  supported: boolean;
  /** Parameters drawn with renderer defaults because the property has no value (FR-RV-004). */
  placeholders: string[];
  /** Named points per view (placement regions, centre…). */
  anchors: Partial<Record<View, Record<string, Point>>>;
  boundaries: BoundaryPath[];
}

/** Pattern definitions referenced by fills (stripes, checks, fabric textures). */
export type PatternDef =
  | {
      id: string;
      kind: 'stripe' | 'check';
      color: string;
      base: string;
      sizeMm: number;
    }
  | {
      id: string;
      kind: 'texture';
      href: string;
      base: string;
      sizeMm: number;
      rotationDeg: number;
    };

export interface SceneWarning {
  code:
    | 'UNSUPPORTED_CATEGORY'
    | 'UNSUPPORTED_COMPONENT'
    | 'BACK_VIEW_NOT_AVAILABLE'
    | 'PLACEHOLDER_GEOMETRY'
    | 'APPROXIMATE_TRIM'
    | 'UNKNOWN_ARTIFACT';
  message: string;
  componentId: string | null;
}

export interface Scene {
  format: 'garment-render/1';
  coordinateSpace: 'design_2d';
  units: 'mm';
  category: string | null;
  capability: GeometryCapability;
  views: Record<View, ViewScene>;
  components: Record<string, ComponentRenderInfo>;
  patterns: PatternDef[];
  warnings: SceneWarning[];
}

/** What the renderer needs to know about an artifact revision (resolved by the caller). */
export interface ArtifactRenderInfo {
  name: string;
  category: string;
  shapeParams: { kind: string; params: Record<string, number | string | boolean> } | null;
}

/** A fabric texture to show in fills (no network inside the package: the caller resolves URLs). */
export interface FabricTexture {
  href: string;
  /** Physical size of one texture tile. */
  sizeMm: number;
  rotationDeg?: number;
}

export interface RenderOptions {
  artifact?: (artifactRevisionId: string) => ArtifactRenderInfo | null;
  fabric?: (ref: {
    entityType: string;
    entityId: string;
    revisionId: string | null;
  }) => FabricTexture | null;
}
