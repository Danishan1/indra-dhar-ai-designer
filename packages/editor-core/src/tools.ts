/**
 * Active canvas tool (SPEC-007 §7). Holding a key can switch to a tool temporarily (Space → pan) and
 * releasing it returns to the previous one. Immutable.
 */
export const Tools = ['select', 'pan', 'zoom'] as const;
export type Tool = (typeof Tools)[number];

export interface ToolState {
  readonly active: Tool;
  /** Tool to return to when a temporary tool is released. */
  readonly previous: Tool | null;
}

export const TOOL_LABELS: Record<Tool, string> = {
  select: 'Select',
  pan: 'Pan',
  zoom: 'Zoom',
};

export const initialToolState: ToolState = { active: 'select', previous: null };

export const isTool = (value: unknown): value is Tool =>
  typeof value === 'string' && (Tools as readonly string[]).includes(value);

export const setTool = (s: ToolState, tool: Tool): ToolState =>
  s.active === tool && s.previous === null ? s : { active: tool, previous: null };

/** Switch while a key is held; nested holds keep the original tool to return to. */
export const holdTool = (s: ToolState, tool: Tool): ToolState =>
  s.active === tool ? s : { active: tool, previous: s.previous ?? s.active };

export const releaseTool = (s: ToolState): ToolState =>
  s.previous === null ? s : { active: s.previous, previous: null };
