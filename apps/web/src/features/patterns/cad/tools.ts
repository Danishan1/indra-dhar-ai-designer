import {
  CircleMinusIcon,
  CirclePlusIcon,
  EyeIcon,
  HandIcon,
  LayoutGridIcon,
  type LucideIcon,
  MousePointer2Icon,
  MoveHorizontalIcon,
  MoveVerticalIcon,
  NavigationIcon,
  PenToolIcon,
  RotateCwIcon,
  RulerIcon,
  ScalingIcon,
  SlidersHorizontalIcon,
  SplineIcon,
  SquareMousePointerIcon,
  TriangleIcon,
  VectorSquareIcon,
  WaypointsIcon,
} from 'lucide-react';

/**
 * The pattern editor's tools (ADR-062), grouped in categories. A category is chosen in the bar
 * above the canvas; its tools appear in the rail on the left of the canvas. Exactly one tool is
 * active; switching tools cancels whatever the previous tool had started (a measurement, a spread,
 * a scale or rotation preview, a point selection).
 */

export type CadTool =
  | 'select'
  | 'pan'
  | 'point'
  | 'add-point'
  | 'delete-point'
  | 'convert'
  | 'scale'
  | 'lengthen'
  | 'widen'
  | 'fit'
  | 'rotate'
  | 'measure'
  | 'seam'
  | 'notch'
  | 'grain';

export type ToolCategory = 'select' | 'points' | 'size' | 'transform' | 'mark' | 'arrange' | 'view';

export interface ToolDef {
  id: CadTool;
  label: string;
  /** Keyboard shortcut (single key, case-insensitive). */
  key: string;
  icon: LucideIcon;
  category: ToolCategory;
  /** Changes the pattern (disabled when the design is read-only). */
  edits: boolean;
  /** One line on how to use it (shown in the options strip). */
  hint: string;
}

export const TOOLS: Record<CadTool, ToolDef> = {
  select: {
    id: 'select',
    label: 'Select and move pieces',
    key: 'V',
    icon: MousePointer2Icon,
    category: 'select',
    edits: false,
    hint: 'Click a piece to select it, drag to move it (Shift: straight), arrows nudge 1 mm (Shift 10, Alt 0.1).',
  },
  pan: {
    id: 'pan',
    label: 'Pan',
    key: 'H',
    icon: HandIcon,
    category: 'select',
    edits: false,
    hint: 'Drag to move the view. Hold Space with any tool to pan; scroll to zoom.',
  },
  point: {
    id: 'point',
    label: 'Edit points and curves',
    key: 'A',
    icon: PenToolIcon,
    category: 'points',
    edits: true,
    hint: 'Click a point (Shift adds), drag a box to select several; drag points or the round handles. Delete removes, arrows nudge.',
  },
  'add-point': {
    id: 'add-point',
    label: 'Add point',
    key: 'P',
    icon: CirclePlusIcon,
    category: 'points',
    edits: true,
    hint: 'Click on a seam line to add a point there.',
  },
  'delete-point': {
    id: 'delete-point',
    label: 'Delete point',
    key: 'X',
    icon: CircleMinusIcon,
    category: 'points',
    edits: true,
    hint: 'Click a point to remove it (a piece keeps at least 3 points).',
  },
  convert: {
    id: 'convert',
    label: 'Corner / smooth, curve / straight',
    key: 'C',
    icon: SplineIcon,
    category: 'points',
    edits: true,
    hint: 'Click a point to switch corner ↔ smooth; click a seam between points to switch curve ↔ straight.',
  },
  scale: {
    id: 'scale',
    label: 'Scale the whole piece',
    key: 'S',
    icon: ScalingIcon,
    category: 'size',
    edits: true,
    hint: 'Drag a corner handle to scale proportionally (Shift: free), a side handle for one direction, Alt: from the centre. Or type the new size.',
  },
  lengthen: {
    id: 'lengthen',
    label: 'Lengthen / shorten at lines',
    key: 'L',
    icon: MoveVerticalIcon,
    category: 'size',
    edits: true,
    hint: 'Click on the piece to place one or more lines, drag to set the amount or type it; it is shared between the lines.',
  },
  widen: {
    id: 'widen',
    label: 'Widen / narrow at lines',
    key: 'W',
    icon: MoveHorizontalIcon,
    category: 'size',
    edits: true,
    hint: 'Click on the piece to place one or more lines, drag to set the amount or type it; it is shared between the lines.',
  },
  fit: {
    id: 'fit',
    label: 'Size by measurement (redraft)',
    key: 'F',
    icon: SlidersHorizontalIcon,
    category: 'size',
    edits: true,
    hint: 'Select a piece, type the width or length you want: the measurement that drives it changes and every piece is redrafted.',
  },
  rotate: {
    id: 'rotate',
    label: 'Rotate',
    key: 'R',
    icon: RotateCwIcon,
    category: 'transform',
    edits: true,
    hint: 'Drag around the selected piece to rotate it (Shift: 15° steps), or type an angle. Flip and 90° turns are in the options.',
  },
  measure: {
    id: 'measure',
    label: 'Measure distance',
    key: 'M',
    icon: RulerIcon,
    category: 'mark',
    edits: false,
    hint: 'Click two points (snaps to pattern points). A third click starts a new measurement.',
  },
  seam: {
    id: 'seam',
    label: 'Seam: length and allowance',
    key: 'E',
    icon: WaypointsIcon,
    category: 'mark',
    edits: true,
    hint: 'Click a seam to select it, then type its exact length or its seam allowance.',
  },
  notch: {
    id: 'notch',
    label: 'Notches',
    key: 'N',
    icon: TriangleIcon,
    category: 'mark',
    edits: true,
    hint: 'Click on a seam line to add a notch; click a notch to remove it.',
  },
  grain: {
    id: 'grain',
    label: 'Grainline',
    key: 'G',
    icon: NavigationIcon,
    category: 'mark',
    edits: true,
    hint: 'Drag across the selected piece to draw its grainline (Shift: 45° steps).',
  },
};

export interface CategoryDef {
  id: ToolCategory;
  label: string;
  icon: LucideIcon;
  tools: CadTool[];
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'select', label: 'Select', icon: SquareMousePointerIcon, tools: ['select', 'pan'] },
  {
    id: 'points',
    label: 'Points & curves',
    icon: VectorSquareIcon,
    tools: ['point', 'add-point', 'delete-point', 'convert'],
  },
  {
    id: 'size',
    label: 'Size & shape',
    icon: ScalingIcon,
    tools: ['scale', 'lengthen', 'widen', 'fit'],
  },
  { id: 'transform', label: 'Transform', icon: RotateCwIcon, tools: ['rotate'] },
  {
    id: 'mark',
    label: 'Measure & mark',
    icon: RulerIcon,
    tools: ['measure', 'seam', 'notch', 'grain'],
  },
  { id: 'arrange', label: 'Arrange', icon: LayoutGridIcon, tools: ['select'] },
  { id: 'view', label: 'View & output', icon: EyeIcon, tools: ['select', 'pan'] },
];

/** Tools that show the points of the selected piece. */
export const POINT_TOOLS: ReadonlySet<CadTool> = new Set(['point', 'delete-point', 'convert']);

export const TOOL_BY_KEY: Record<string, CadTool> = Object.fromEntries(
  Object.values(TOOLS).map((t) => [t.key.toLowerCase(), t.id]),
);
