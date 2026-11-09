'use client';

import type { PatternPiece, PatternSpec } from '@ai-designer/garment-model';
import { draftPattern, draftToState } from '@ai-designer/pattern-model';
import { createContext, type ReactNode, useContext, useState } from 'react';

import type { CadSettings } from '@/features/patterns/cad/pattern-cad';
import { type CadTool, CATEGORIES, type ToolCategory, TOOLS } from '@/features/patterns/cad/tools';
import type { Unit } from '@/features/patterns/options';

import { useEditor, useEditorStore } from '../store-context';

/**
 * Pattern editor UI state shared by the canvas, the tool rail and the side panels (ADR-059/062):
 * selection, unit, selected points, the active tool and its category, canvas settings.
 */

export interface PatternUi {
  selected: string | null;
  setSelected: (id: string | null) => void;
  unit: Unit;
  setUnit: (u: Unit) => void;
  nodes: number[];
  setNodes: (n: number[]) => void;
  tool: CadTool;
  /** Activates a tool; its category becomes the shown one (unless the tool is also in it). */
  setTool: (t: CadTool) => void;
  category: ToolCategory;
  /** Shows a category; activates its first tool unless the current tool belongs to it. */
  setCategory: (c: ToolCategory) => void;
  settings: CadSettings;
  setSettings: (s: CadSettings) => void;
}
const Ctx = createContext<PatternUi | null>(null);

const CAL_KEY = 'aid.cad.pxPerMm';
const DEFAULT_PX_PER_MM = 96 / 25.4;

function readCalibration(): number {
  try {
    const v = Number(window.localStorage.getItem(CAL_KEY));
    return v > 0.5 && v < 20 ? v : DEFAULT_PX_PER_MM;
  } catch {
    return DEFAULT_PX_PER_MM;
  }
}

export function PatternUiProvider({ children }: { children: ReactNode }) {
  const [selected, setSelectedRaw] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit>('cm');
  const [nodes, setNodes] = useState<number[]>([]);
  const [tool, setToolRaw] = useState<CadTool>('select');
  const [category, setCategoryRaw] = useState<ToolCategory>('select');
  const setTool = (t: CadTool) => {
    setToolRaw(t);
    setCategoryRaw((c) =>
      CATEGORIES.find((x) => x.id === c)?.tools.includes(t) ? c : TOOLS[t].category,
    );
  };
  const setCategory = (c: ToolCategory) => {
    setCategoryRaw(c);
    const def = CATEGORIES.find((x) => x.id === c)!;
    if (!def.tools.includes(tool)) setToolRaw(def.tools[0]!);
  };
  const [settings, setSettingsRaw] = useState<CadSettings>(() => ({
    snapGrid: false,
    snapPoints: true,
    showGrid: true,
    showAllowance: true,
    showDimensions: true,
    pxPerMm: typeof window === 'undefined' ? DEFAULT_PX_PER_MM : readCalibration(),
  }));
  const setSelected = (id: string | null) => {
    setSelectedRaw(id);
    setNodes([]);
  };
  const setSettings = (next: CadSettings) => {
    setSettingsRaw(next);
    try {
      window.localStorage.setItem(CAL_KEY, String(next.pxPerMm));
    } catch {
      // per-browser convenience only
    }
  };
  return (
    <Ctx.Provider
      value={{
        selected,
        setSelected,
        unit,
        setUnit,
        nodes,
        setNodes,
        tool,
        setTool,
        category,
        setCategory,
        settings,
        setSettings,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePatternUi(): PatternUi {
  const v = useContext(Ctx);
  if (!v) throw new Error('PatternUiProvider missing');
  return v;
}

/** Redraft from a new spec and apply it as one operation. */
export function useRedraft() {
  const state = useEditor((s) => s.display);
  const apply = useEditor((s) => s.apply);
  return (spec: PatternSpec, label: string, redraftEdited = false) => {
    const draft = draftPattern(spec);
    const next = draftToState(state, draft, { redraftEdited });
    apply(
      {
        type: 'set_pattern_draft',
        patternSpec: draft.spec,
        components: next.components,
        patternPieces: next.patternPieces,
        garmentType: draft.garmentType,
        garmentCategory: draft.category,
      },
      { label },
    );
  };
}

export function useEditPiece() {
  const state = useEditor((s) => s.display);
  const apply = useEditor((s) => s.apply);
  return (piece: PatternPiece, label: string, groupId?: string) => {
    const own = (state.patternPieces ?? []).filter((p) => p.componentId === piece.componentId);
    apply(
      {
        type: 'replace_pattern_pieces',
        componentId: piece.componentId,
        pieces: own.map((p) => (p.pieceId === piece.pieceId ? piece : p)),
      },
      { label, ...(groupId ? { groupId } : {}) },
    );
  };
}

/**
 * Replaces several pieces as ONE undo step (rearrange, pack): one `replace_pattern_pieces` per
 * part, sharing a group id. Reads the latest state for each part so earlier calls are not lost.
 */
export function useEditPieces() {
  const store = useEditorStore();
  const apply = useEditor((s) => s.apply);
  return (updated: readonly PatternPiece[], label: string) => {
    if (!updated.length) return;
    const groupId = globalThis.crypto.randomUUID();
    const byPart = new Map<string, PatternPiece[]>();
    for (const p of updated) byPart.set(p.componentId, [...(byPart.get(p.componentId) ?? []), p]);
    for (const [componentId, list] of byPart) {
      const current = store.getState().display.patternPieces ?? [];
      const own = current.filter((p) => p.componentId === componentId);
      const next = new Map(list.map((p) => [p.pieceId, p]));
      apply(
        {
          type: 'replace_pattern_pieces',
          componentId,
          pieces: own.map((p) => next.get(p.pieceId) ?? p),
        },
        { label, groupId },
      );
    }
  };
}
