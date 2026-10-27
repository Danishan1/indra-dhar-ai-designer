/**
 * Canvas view options (editor-local, never design data): which views are shown and which drawing
 * layers are visible (SPEC-007 §6, FR-EDT-009…017).
 */
export const ViewModes = ['front', 'back', 'split'] as const;
export type ViewMode = (typeof ViewModes)[number];

export const CanvasLayers = ['garment', 'trims', 'artwork', 'guides'] as const;
export type CanvasLayer = (typeof CanvasLayers)[number];

export type LayerVisibility = Readonly<Record<CanvasLayer, boolean>>;

export const defaultLayers: LayerVisibility = Object.freeze({
  garment: true,
  trims: true,
  artwork: true,
  guides: false,
});

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  front: 'Front',
  back: 'Back',
  split: 'Split',
};
export const LAYER_LABELS: Record<CanvasLayer, string> = {
  garment: 'Garment',
  trims: 'Trims',
  artwork: 'Artwork placeholders',
  guides: 'Guides',
};

export const toggleLayer = (l: LayerVisibility, layer: CanvasLayer): LayerVisibility => ({
  ...l,
  [layer]: !l[layer],
});

export const visibleLayers = (l: LayerVisibility): CanvasLayer[] =>
  CanvasLayers.filter((k) => l[k]);

export const isViewMode = (v: unknown): v is ViewMode =>
  typeof v === 'string' && (ViewModes as readonly string[]).includes(v);
