'use client';

import { type PatternPiece, type PatternSpec, patternSpecSchema } from '@ai-designer/garment-model';
import {
  deleteNodes,
  draftPattern,
  draftToState,
  EDGE_LABELS,
  ensurePath,
  mirrorPiece,
  pathEdgeLength,
  piecesToDxf,
  pieceBounds,
  pieceDimensions,
  resizePiece,
  rotatePiece,
  seamChecks,
  setEdgeLength,
  edgeAllowance,
  edgeOnFold,
  setNodePosition,
  setSegmentCurved,
  setSmooth,
  spreadPiece,
  tiledPrintHtml,
  withPath,
} from '@ai-designer/pattern-model';
import {
  DownloadIcon,
  FlipHorizontal2Icon,
  FlipVertical2Icon,
  Grid2x2CheckIcon,
  Grid3x3Icon,
  HandIcon,
  ImageIcon,
  MagnetIcon,
  MinusIcon,
  MousePointer2Icon,
  MoveHorizontalIcon,
  MoveVerticalIcon,
  PanelRightCloseIcon,
  PenToolIcon,
  PlusIcon,
  PrinterIcon,
  RotateCcwIcon,
  RotateCwIcon,
  RulerDimensionLineIcon,
  RulerIcon,
  ScissorsIcon,
  SquareDashedIcon,
  Trash2Icon,
} from 'lucide-react';
import { createContext, type ReactNode, useContext, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { assetContentUrl } from '@/features/assets/api';
import { useOrganization } from '@/features/organizations/organization-provider';
import {
  type CadApi,
  type CadSettings,
  type CadTool,
  PatternCad,
} from '@/features/patterns/cad/pattern-cad';
import { GarmentStyleForms } from '@/features/patterns/garment-forms';
import { fmt, type Unit } from '@/features/patterns/options';
import {
  ChecksList,
  GarmentBasics,
  MeasurementsForm,
  UnitToggle,
} from '@/features/patterns/pattern-forms';
import { cn } from '@/lib/utils';

import { useEditor } from '../store-context';

/**
 * Component 2 (ADR-058/059): the pattern editor — a small CAD for flat patterns. Pieces only, with
 * real-scale rulers, grid, snapping and 1:1 zoom; the sketch as a side reference. Change the pattern
 * by measurements and style (redrafted, stays sewable), or edit pieces directly: Bézier points and
 * curves with exact coordinates, lengthen/widen across a line, exact seam lengths, resize, rotate,
 * mirror, move. Every change is a design operation (undo, save, revisions). DXF and 1:1 print out.
 */

interface PatternUi {
  selected: string | null;
  setSelected: (id: string | null) => void;
  unit: Unit;
  setUnit: (u: Unit) => void;
  nodes: number[];
  setNodes: (n: number[]) => void;
  tool: CadTool;
  setTool: (t: CadTool) => void;
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
  const [tool, setTool] = useState<CadTool>('select');
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
        settings,
        setSettings,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

function usePatternUi(): PatternUi {
  const v = useContext(Ctx);
  if (!v) throw new Error('PatternUiProvider missing');
  return v;
}

/** Redraft from a new spec and apply it as one operation. */
function useRedraft() {
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

function useEditPiece() {
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

// ── left: pieces ─────────────────────────────────────────────────────────────

export function PatternPieceList() {
  const state = useEditor((s) => s.display);
  const { selected, setSelected } = usePatternUi();
  const pieces = state.patternPieces ?? [];
  const byId = new Map(state.components.map((c) => [c.componentId, c]));
  // Co-ord sets: the garment (set_garment) each part belongs to.
  const garmentOf = (id: string) => {
    let c = byId.get(id);
    for (let guard = 0; c && guard < 10; guard++) {
      if (c.componentType === 'set_garment') return c;
      c = c.parentComponentId ? byId.get(c.parentComponentId) : undefined;
    }
    return null;
  };
  const groups = state.components
    .filter((c) => c.parentComponentId !== null)
    .map((c) => ({
      c,
      g: garmentOf(c.componentId),
      pieces: pieces.filter((p) => p.componentId === c.componentId),
    }))
    .filter((g) => g.pieces.length);
  return (
    <nav
      aria-label="Pattern pieces"
      className="flex min-h-0 flex-1 flex-col overflow-auto p-2 text-[13px]"
      data-testid="piece-list"
    >
      {groups.map(({ c, g, pieces: list }, i) => (
        <div key={c.componentId} className="mb-2">
          {g && groups[i - 1]?.g?.componentId !== g.componentId ? (
            <div
              className="mt-1 mb-1 border-b px-1 pb-0.5 text-[12px] font-semibold"
              data-testid="piece-list-garment"
            >
              {g.displayName}
            </div>
          ) : null}
          <div className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {c.displayName}
          </div>
          {list.map((p) => (
            <button
              key={p.pieceId}
              type="button"
              onClick={() => setSelected(p.pieceId)}
              aria-pressed={selected === p.pieceId}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent',
                selected === p.pieceId && 'bg-accent font-medium',
              )}
              data-testid="piece-list-item"
            >
              <ScissorsIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-[11px] text-muted-foreground">×{p.cutQuantity}</span>
              {p.source === 'user' ? (
                <span
                  className="rounded bg-status-needs-review/15 px-1 text-[10px] text-status-needs-review"
                  title="Edited by hand — not redrafted"
                >
                  edited
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

// ── centre: canvas + side reference ─────────────────────────────────────────

const TOOLS: { tool: CadTool; label: string; key: string; icon: typeof MousePointer2Icon }[] = [
  { tool: 'select', label: 'Select and move pieces', key: 'V', icon: MousePointer2Icon },
  { tool: 'point', label: 'Edit points and curves', key: 'A', icon: PenToolIcon },
  { tool: 'measure', label: 'Measure', key: 'M', icon: RulerIcon },
  { tool: 'lengthen', label: 'Lengthen / shorten across a line', key: 'L', icon: MoveVerticalIcon },
  { tool: 'widen', label: 'Widen / narrow across a line', key: 'W', icon: MoveHorizontalIcon },
  { tool: 'pan', label: 'Pan (or hold Space)', key: 'H', icon: HandIcon },
];

export function PatternViewport() {
  const state = useEditor((s) => s.display);
  const designName = useEditor((s) => s.meta.design.name);
  const canEdit = useEditor((s) => s.meta.capabilities.canEdit);
  const ui = usePatternUi();
  const {
    selected,
    setSelected,
    unit,
    setUnit,
    tool,
    setTool,
    settings,
    setSettings,
    nodes,
    setNodes,
  } = ui;
  const edit = useEditPiece();
  const { active } = useOrganization();
  const [refOpen, setRefOpen] = useState(true);
  const [calOpen, setCalOpen] = useState(false);
  const cad = useRef<CadApi | null>(null);
  const pieces = useMemo(() => state.patternPieces ?? [], [state.patternPieces]);
  const sources = (state.sources ?? []).filter(
    (s) => s.role === 'sketch' || s.role === 'reference',
  );
  const toggle = (k: 'snapGrid' | 'snapPoints' | 'showGrid' | 'showAllowance' | 'showDimensions') =>
    setSettings({ ...settings, [k]: !settings[k] });
  const exportDxf = () => {
    const blob = new Blob([piecesToDxf(pieces)], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${designName.replace(/[^\w-]+/g, '_') || 'pattern'}.dxf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const print = (paper: 'a4' | 'letter') => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    w.document.write(
      tiledPrintHtml(pieces, { paper, title: designName }).replace(
        '</body>',
        '<script>window.onload=()=>setTimeout(()=>window.print(),300)</' + 'script></body>',
      ),
    );
    w.document.close();
  };
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="pattern-workspace">
      <div
        className="flex flex-wrap items-center gap-1 border-b bg-panel/95 px-2 py-1 text-xs"
        data-testid="cad-toolbar"
      >
        <div role="toolbar" aria-label="Pattern tools" className="flex rounded-md border p-0.5">
          {TOOLS.map((t) => (
            <Button
              key={t.tool}
              size="icon-sm"
              variant="ghost"
              title={`${t.label} (${t.key})`}
              aria-label={t.label}
              aria-pressed={tool === t.tool}
              className={cn(tool === t.tool && 'bg-accent text-accent-foreground')}
              disabled={
                !canEdit && (t.tool === 'point' || t.tool === 'lengthen' || t.tool === 'widen')
              }
              onClick={() => setTool(t.tool)}
              data-testid={`tool-${t.tool}`}
            >
              <t.icon />
            </Button>
          ))}
        </div>
        <UnitToggle unit={unit} onChange={setUnit} />
        <div
          className="flex rounded-md border p-0.5"
          role="group"
          aria-label="Snapping and display"
        >
          {(
            [
              ['snapPoints', 'Snap to points', MagnetIcon],
              ['snapGrid', 'Snap to grid', Grid2x2CheckIcon],
              ['showGrid', 'Show grid', Grid3x3Icon],
              ['showAllowance', 'Show seam allowance', SquareDashedIcon],
              ['showDimensions', 'Show dimensions on all pieces', RulerDimensionLineIcon],
            ] as const
          ).map(([k, label, Icon]) => (
            <Button
              key={k}
              size="icon-sm"
              variant="ghost"
              title={label}
              aria-label={label}
              aria-pressed={settings[k]}
              className={cn(settings[k] && 'bg-accent text-accent-foreground')}
              onClick={() => toggle(k)}
              data-testid={`toggle-${k}`}
            >
              <Icon />
            </Button>
          ))}
        </div>
        <div className="flex rounded-md border p-0.5" role="group" aria-label="Zoom">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            title="Fit all (0)"
            onClick={() => cad.current?.zoomTo('fit')}
            data-testid="zoom-fit"
          >
            Fit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            title="True size (1)"
            onClick={() => cad.current?.zoomTo('actual')}
            data-testid="zoom-actual"
          >
            1:1
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Zoom out"
            onClick={() => cad.current?.zoomTo('out')}
          >
            <MinusIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Zoom in"
            onClick={() => cad.current?.zoomTo('in')}
          >
            <PlusIcon />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            title="Calibrate true size for this screen"
            onClick={() => setCalOpen((v) => !v)}
            data-testid="calibrate"
          >
            Calibrate
          </Button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={() => print('a4')}
            title="Print at true size on A4 (tiled)"
            data-testid="print-1to1"
          >
            <PrinterIcon /> Print 1:1
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={exportDxf}
            title="DXF for pattern CAD software and plotters"
            data-testid="export-dxf"
          >
            <DownloadIcon /> DXF
          </Button>
          {sources.length ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => setRefOpen((v) => !v)}
              aria-pressed={refOpen}
              data-testid="toggle-reference"
            >
              {refOpen ? <PanelRightCloseIcon /> : <ImageIcon />} Reference
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <PatternCad
            pieces={pieces}
            unit={unit}
            editable={canEdit}
            tool={tool}
            onTool={setTool}
            settings={settings}
            selectedId={selected}
            onSelect={setSelected}
            nodes={nodes}
            onNodes={setNodes}
            onCommit={(p, label, group) => edit(p, label, group)}
            apiRef={cad}
            overlay={
              calOpen ? (
                <Calibration
                  settings={settings}
                  onChange={setSettings}
                  onClose={() => setCalOpen(false)}
                />
              ) : null
            }
          />
        </div>
        {refOpen && sources.length ? (
          <aside
            className="flex w-60 shrink-0 flex-col gap-2 overflow-auto border-l bg-muted/30 p-2"
            aria-label="Reference"
            data-testid="reference-panel"
          >
            {sources.map((s) => (
              <figure key={s.assetId} className="flex flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={assetContentUrl(active.id, s.assetId, 'preview_1024')}
                  alt={s.label ?? 'Reference sketch'}
                  className="w-full rounded-md border bg-white object-contain"
                />
                <figcaption className="text-[11px] text-muted-foreground">
                  {s.label ?? 'Sketch'}
                </figcaption>
              </figure>
            ))}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/** True size: measure the bar with a real ruler and type what you measured. */
function Calibration({
  settings,
  onChange,
  onClose,
}: {
  settings: CadSettings;
  onChange: (s: CadSettings) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('10');
  const px = settings.pxPerMm * 100;
  return (
    <div
      className="absolute top-8 left-8 z-20 flex w-80 flex-col gap-2 rounded-lg border bg-background p-3 text-[12px] shadow-lg"
      data-testid="calibration"
    >
      <div className="font-medium">Calibrate true size (1:1)</div>
      <p className="text-muted-foreground">
        Hold a ruler against the bar below and enter its real length in centimetres.
      </p>
      <div
        className="h-3 bg-foreground"
        style={{ width: px }}
        aria-label="10 cm bar at the current calibration"
      />
      <div className="flex items-center gap-2">
        <Input
          className="h-7 w-20 text-[12px]"
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Measured length of the bar (cm)"
        />
        cm
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            const cm = Number(text.replace(',', '.'));
            if (cm > 1 && cm < 50) onChange({ ...settings, pxPerMm: (settings.pxPerMm * 10) / cm });
            setText('10');
          }}
        >
          Apply
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => onChange({ ...settings, pxPerMm: 96 / 25.4 })}
        >
          Reset
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

// ── right: piece · measurements · style · checks ────────────────────────────

export function PatternSidePanel() {
  const state = useEditor((s) => s.display);
  const canEdit = useEditor((s) => s.meta.capabilities.canEdit);
  const { selected, unit } = usePatternUi();
  const redraft = useRedraft();
  const spec = state.patternSpec!;
  const pieces = useMemo(() => state.patternPieces ?? [], [state.patternPieces]);
  const checks = useMemo(() => seamChecks(pieces, spec), [pieces, spec]);
  const piece = pieces.find((p) => p.pieceId === selected) ?? null;
  const edited = pieces.filter((p) => p.source === 'user');
  const bad = checks.filter((c) => c.status !== 'ok').length;
  return (
    <Tabs defaultValue="measurements" className="flex min-h-0 flex-1 flex-col">
      <TabsList className="mx-2 mt-2 grid grid-cols-4">
        <TabsTrigger value="piece">Piece</TabsTrigger>
        <TabsTrigger value="measurements">Sizes</TabsTrigger>
        <TabsTrigger value="style">Style</TabsTrigger>
        <TabsTrigger value="checks">
          Fit
          {bad ? (
            <span className="ml-1 rounded-full bg-destructive px-1 text-[10px] text-white">
              {bad}
            </span>
          ) : null}
        </TabsTrigger>
      </TabsList>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {edited.length ? (
          <div
            className="mb-3 rounded-md border border-status-needs-review/50 p-2 text-[12px]"
            data-testid="edited-banner"
          >
            {edited.length} piece{edited.length === 1 ? ' was' : 's were'} edited by hand and{' '}
            {edited.length === 1 ? 'is' : 'are'} kept when you change sizes or style.
            <Button
              size="sm"
              variant="outline"
              className="mt-1.5 h-7 w-full text-xs"
              disabled={!canEdit}
              onClick={() => redraft(spec, 'Redraft all pieces', true)}
            >
              <RotateCcwIcon /> Redraft them from the measurements
            </Button>
          </div>
        ) : null}
        <TabsContent value="piece">
          {piece ? (
            <PieceForm piece={piece} unit={unit} disabled={!canEdit} />
          ) : (
            <p className="text-[12px] text-muted-foreground">
              Select a piece on the pattern or in the list.
            </p>
          )}
        </TabsContent>
        <TabsContent value="measurements" className="flex flex-col gap-3">
          <GarmentBasics
            spec={spec}
            disabled={!canEdit}
            onChange={(s, label) => redraft(s, label)}
          />
          <MeasurementsForm
            spec={spec}
            unit={unit}
            disabled={!canEdit}
            onChange={(s, label) => redraft(s, label)}
          />
        </TabsContent>
        <TabsContent value="style">
          <GarmentStyleForms
            spec={spec}
            disabled={!canEdit}
            onChange={(s, label) => redraft(patternSpecSchema.parse(s), label)}
          />
        </TabsContent>
        <TabsContent value="checks">
          <p className="mb-2 text-[12px] text-muted-foreground">
            Seams that are sewn together, measured on the pieces as they are now.
          </p>
          <ChecksList checks={checks} unit={unit} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

function PieceForm({
  piece,
  unit,
  disabled,
}: {
  piece: PatternPiece;
  unit: Unit;
  disabled: boolean;
}) {
  const edit = useEditPiece();
  const state = useEditor((s) => s.display);
  const { nodes, setNodes } = usePatternUi();
  const dims = pieceDimensions(piece);
  const path = useMemo(() => ensurePath(piece), [piece]);
  const b = pieceBounds(piece);
  const resetPiece = () => {
    const draft = draftPattern(state.patternSpec!);
    const fresh = draftToState(state, draft, { redraftEdited: true }).patternPieces.find(
      (p) => p.draft?.template === piece.draft?.template,
    );
    if (fresh)
      edit(
        {
          ...fresh,
          pieceId: piece.pieceId,
          componentId: piece.componentId,
          ...(piece.canvas ? { canvas: piece.canvas } : {}),
        },
        `Redraft ${piece.name}`,
      );
  };
  const set = (patch: Partial<PatternPiece>, label: string) =>
    edit({ ...piece, ...patch, source: 'user', status: 'needs_review' }, label);
  const single = nodes.length === 1 ? nodes[0]! : null;
  const nd = single !== null ? path[single] : null;
  return (
    <div className="flex flex-col gap-3 text-[12px]" data-testid="piece-form">
      <div>
        <div className="text-sm font-semibold">{piece.name}</div>
        <div className="text-muted-foreground">
          {piece.source === 'user' ? 'Edited by hand' : 'Drafted from the measurements'} · cut{' '}
          {piece.cutQuantity}
          {piece.foldLine ? ' on the fold' : piece.mirrored ? ' as a mirrored pair' : ''} ·{' '}
          {path.length} points
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <LengthField
          label={`Width (${unit})`}
          mm={dims.width}
          unit={unit}
          disabled={disabled}
          testId="piece-input-width"
          onCommit={(mm) => edit(resizePiece(piece, { width: mm }), `Width of ${piece.name}`)}
        />
        <LengthField
          label={`Height (${unit})`}
          mm={dims.height}
          unit={unit}
          disabled={disabled}
          testId="piece-input-height"
          onCommit={(mm) => edit(resizePiece(piece, { height: mm }), `Height of ${piece.name}`)}
        />
        <label className="flex flex-col gap-1">
          <span>Seam allowance (mm)</span>
          <Input
            className="h-7 text-[12px]"
            type="number"
            min={0}
            max={50}
            disabled={disabled}
            defaultValue={piece.seamAllowanceMm ?? 0}
            key={`sa-${piece.pieceId}-${piece.seamAllowanceMm}`}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 0 && v <= 50 && v !== piece.seamAllowanceMm)
                set({ seamAllowanceMm: v }, `Seam allowance of ${piece.name}`);
            }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Cut quantity</span>
          <Input
            className="h-7 text-[12px]"
            type="number"
            min={1}
            max={12}
            disabled={disabled}
            defaultValue={piece.cutQuantity}
            key={`cut-${piece.pieceId}-${piece.cutQuantity}`}
            onBlur={(e) => {
              const v = Math.round(Number(e.target.value));
              if (v >= 1 && v <= 12 && v !== piece.cutQuantity)
                set({ cutQuantity: v }, `Cut quantity of ${piece.name}`);
            }}
          />
        </label>
      </div>

      <section className="flex flex-col gap-1.5" data-testid="transform-section">
        <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Transform
        </h3>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={disabled}
            onClick={() => edit(rotatePiece(piece, -90), `Rotate ${piece.name}`)}
            title="Rotate 90° left"
          >
            <RotateCcwIcon /> 90°
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={disabled}
            onClick={() => edit(rotatePiece(piece, 90), `Rotate ${piece.name}`)}
            title="Rotate 90° right"
            data-testid="rotate-right"
          >
            <RotateCwIcon /> 90°
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={disabled}
            onClick={() => edit(mirrorPiece(piece, 'vertical'), `Mirror ${piece.name}`)}
            title="Flip horizontally"
            data-testid="mirror-h"
          >
            <FlipHorizontal2Icon />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={disabled}
            onClick={() => edit(mirrorPiece(piece, 'horizontal'), `Mirror ${piece.name}`)}
            title="Flip vertically"
          >
            <FlipVertical2Icon />
          </Button>
        </div>
        <RotateField
          disabled={disabled}
          onRotate={(deg) => edit(rotatePiece(piece, deg), `Rotate ${piece.name} ${deg}°`)}
        />
      </section>

      <SpreadSection
        piece={piece}
        unit={unit}
        disabled={disabled}
        bounds={b}
        onApply={(p, label) => edit(p, label)}
      />

      <section className="flex flex-col gap-1.5" data-testid="point-section">
        <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Points
        </h3>
        {nd && single !== null ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <LengthField
                label={`X (${unit})`}
                mm={nd.x}
                unit={unit}
                disabled={disabled}
                allowNegative
                testId="node-x"
                onCommit={(mm) =>
                  edit(
                    withPath(piece, setNodePosition(path, single, { x: mm, y: nd.y })),
                    `Move a point of ${piece.name}`,
                  )
                }
              />
              <LengthField
                label={`Y (${unit})`}
                mm={nd.y}
                unit={unit}
                disabled={disabled}
                allowNegative
                testId="node-y"
                onCommit={(mm) =>
                  edit(
                    withPath(piece, setNodePosition(path, single, { x: nd.x, y: mm })),
                    `Move a point of ${piece.name}`,
                  )
                }
              />
            </div>
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="outline"
                className={cn('h-7 text-xs', !nd.smooth && 'bg-accent')}
                disabled={disabled}
                onClick={() =>
                  edit(withPath(piece, setSmooth(path, single, false)), 'Corner point')
                }
              >
                Corner
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={cn('h-7 text-xs', nd.smooth && 'bg-accent')}
                disabled={disabled}
                onClick={() => edit(withPath(piece, setSmooth(path, single, true)), 'Smooth point')}
                data-testid="node-smooth"
              >
                Smooth
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={disabled}
                onClick={() =>
                  edit(
                    withPath(
                      piece,
                      setSegmentCurved(
                        path,
                        single,
                        !(nd.out || path[(single + 1) % path.length]!.in),
                      ),
                    ),
                    'Curve / straighten a segment',
                  )
                }
              >
                {nd.out || path[(single + 1) % path.length]!.in
                  ? 'Straighten next segment'
                  : 'Curve next segment'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={disabled || path.length <= 3}
                onClick={() => {
                  edit(
                    withPath(piece, deleteNodes(path, [single])),
                    `Delete a point of ${piece.name}`,
                  );
                  setNodes([]);
                }}
              >
                <Trash2Icon /> Delete
              </Button>
            </div>
            <p className="text-muted-foreground">
              Seam: {EDGE_LABELS[nd.seg] ?? (nd.seg || '—')} · coordinates from the piece origin
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">
            {nodes.length > 1
              ? `${nodes.length} points selected — drag them, nudge with the arrow keys (Shift ×10, Alt ×0.1) or press Delete.`
              : 'Use the point tool (A): click a point, Shift-click or drag a box for several, double-click a seam to add a point, drag the round handles to shape curves.'}
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Seam lengths ({unit}) — type to set exactly
        </h3>
        <table className="w-full" data-testid="piece-edges">
          <thead>
            <tr className="text-[10px] text-muted-foreground">
              <th className="text-left font-normal">Seam</th>
              <th className="text-left font-normal">Length</th>
              <th className="text-right font-normal">Intake</th>
              <th className="text-right font-normal">SA mm</th>
            </tr>
          </thead>
          <tbody>
            {[...new Set(path.map((n) => n.seg).filter(Boolean))].map((name) => {
              const L = pathEdgeLength(path, name);
              const intake = piece.edges?.find((e) => e.name === name)?.intakeMm ?? 0;
              return (
                <tr key={name} className="border-b last:border-0">
                  <td className="py-0.5">{EDGE_LABELS[name] ?? name.replaceAll('_', ' ')}</td>
                  <td className="w-24 py-0.5">
                    <LengthField
                      mm={L}
                      unit={unit}
                      disabled={disabled}
                      compact
                      testId={`edge-${name}`}
                      onCommit={(mm) =>
                        edit(
                          setEdgeLength(piece, name, mm, 'end'),
                          `Set ${EDGE_LABELS[name] ?? name} of ${piece.name} to ${fmt(mm, unit)} ${unit}`,
                        )
                      }
                    />
                  </td>
                  <td className="py-0.5 pl-2 text-right text-muted-foreground tabular-nums">
                    {intake ? `−${fmt(intake, unit)}` : ''}
                  </td>
                  <td className="w-14 py-0.5 pl-2 text-right">
                    {edgeOnFold(piece, name) ? (
                      <span
                        className="text-[11px] text-violet-600"
                        title="Cut on the fold: no seam allowance"
                      >
                        fold
                      </span>
                    ) : (
                      <Input
                        className="h-6 px-1 text-right text-[12px] tabular-nums"
                        type="number"
                        min={0}
                        max={100}
                        aria-label={`Seam allowance of the ${EDGE_LABELS[name] ?? name}`}
                        disabled={disabled}
                        data-testid={`edge-sa-${name}`}
                        defaultValue={edgeAllowance(piece, name)}
                        key={`esa-${piece.pieceId}-${name}-${edgeAllowance(piece, name)}`}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (
                            !Number.isFinite(v) ||
                            v < 0 ||
                            v > 100 ||
                            v === edgeAllowance(piece, name)
                          )
                            return;
                          const rest = { ...(piece.allowances ?? {}) };
                          if (v === (piece.seamAllowanceMm ?? 0)) delete rest[name];
                          else rest[name] = v;
                          edit(
                            { ...piece, allowances: rest },
                            `Seam allowance of the ${EDGE_LABELS[name] ?? name} of ${piece.name}: ${v} mm`,
                          );
                        }}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-1 text-muted-foreground">
          Setting a length moves the seam&apos;s end point along the seam. Each seam can have its
          own allowance (e.g. a deeper hem); fold edges never get one.
        </p>
      </section>

      {piece.notes.length ? (
        <ul className="list-disc pl-4 text-muted-foreground">
          {piece.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      {piece.source === 'user' && piece.draft?.template ? (
        <Button size="sm" variant="outline" disabled={disabled} onClick={resetPiece}>
          <RotateCcwIcon /> Redraft this piece
        </Button>
      ) : null}
    </div>
  );
}

function LengthField({
  label,
  mm,
  unit,
  disabled,
  onCommit,
  testId,
  compact,
  allowNegative,
}: {
  label?: string;
  mm: number;
  unit: Unit;
  disabled?: boolean;
  onCommit: (mm: number) => void;
  testId?: string;
  compact?: boolean;
  allowNegative?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? fmt(mm, unit);
  const commit = () => {
    if (text === null) return;
    const v = Number(text.replace(',', '.'));
    setText(null);
    if (!Number.isFinite(v) || (!allowNegative && v <= 0)) return;
    const next = unit === 'mm' ? v : unit === 'in' ? v * 25.4 : v * 10;
    if (Math.abs(next - mm) > 0.04) onCommit(Math.round(next * 100) / 100);
  };
  const input = (
    <Input
      className={cn('h-7 text-[12px] tabular-nums', compact && 'text-right')}
      inputMode="decimal"
      disabled={disabled}
      value={shown}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setText(null);
      }}
      data-testid={testId}
    />
  );
  if (!label) return input;
  return (
    <label className="flex flex-col gap-1">
      <span>{label}</span>
      {input}
    </label>
  );
}

function RotateField({
  disabled,
  onRotate,
}: {
  disabled: boolean;
  onRotate: (deg: number) => void;
}) {
  const [deg, setDeg] = useState('');
  return (
    <div className="flex items-center gap-2">
      <span>Rotate by</span>
      <Input
        className="h-7 w-20 text-[12px]"
        inputMode="decimal"
        value={deg}
        disabled={disabled}
        onChange={(e) => setDeg(e.target.value)}
        aria-label="Rotation in degrees"
        placeholder="0"
      />
      °
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={disabled || !Number(deg)}
        onClick={() => {
          onRotate(Number(deg.replace(',', '.')));
          setDeg('');
        }}
      >
        Rotate
      </Button>
    </div>
  );
}

/** Numeric lengthen / widen: at a position across the piece, by an amount (negative = shorten). */
function SpreadSection({
  piece,
  unit,
  disabled,
  bounds,
  onApply,
}: {
  piece: PatternPiece;
  unit: Unit;
  disabled: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  onApply: (p: PatternPiece, label: string) => void;
}) {
  const [mode, setMode] = useState<'lengthen' | 'widen'>('lengthen');
  const [at, setAt] = useState('50');
  const [amount, setAmount] = useState('');
  const toMm = (t: string) => {
    const v = Number(t.replace(',', '.'));
    return Number.isFinite(v) ? (unit === 'mm' ? v : unit === 'in' ? v * 25.4 : v * 10) : NaN;
  };
  const apply = () => {
    const pct = Math.min(99, Math.max(1, Number(at) || 50)) / 100;
    const a = toMm(amount);
    if (!Number.isFinite(a) || !a) return;
    const line =
      mode === 'lengthen'
        ? { point: { x: bounds.x, y: bounds.y + bounds.height * pct }, dir: { x: 1, y: 0 } }
        : { point: { x: bounds.x + bounds.width * pct, y: bounds.y }, dir: { x: 0, y: -1 } };
    onApply(
      spreadPiece(piece, line, a),
      `${a > 0 ? (mode === 'lengthen' ? 'Lengthen' : 'Widen') : mode === 'lengthen' ? 'Shorten' : 'Narrow'} ${piece.name} by ${fmt(Math.abs(a), unit)} ${unit}`,
    );
    setAmount('');
  };
  return (
    <section className="flex flex-col gap-1.5" data-testid="spread-section">
      <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        Lengthen / widen
      </h3>
      <div className="flex rounded-md border p-0.5">
        {(['lengthen', 'widen'] as const).map((m) => (
          <Button
            key={m}
            size="sm"
            variant="ghost"
            aria-pressed={mode === m}
            className={cn('h-6 flex-1 text-xs', mode === m && 'bg-accent')}
            onClick={() => setMode(m)}
          >
            {m === 'lengthen' ? 'Length' : 'Width'}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span>At (% of the {mode === 'lengthen' ? 'height' : 'width'})</span>
          <Input
            className="h-7 text-[12px]"
            inputMode="decimal"
            value={at}
            disabled={disabled}
            onChange={(e) => setAt(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>
            Change ({unit}, − to {mode === 'lengthen' ? 'shorten' : 'narrow'})
          </span>
          <Input
            className="h-7 text-[12px]"
            inputMode="decimal"
            value={amount}
            disabled={disabled}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
            placeholder="e.g. 2"
            data-testid="spread-input"
          />
        </label>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={disabled || !amount}
        onClick={apply}
        data-testid="spread-numeric-apply"
      >
        Apply
      </Button>
      <p className="text-muted-foreground">
        Or use the tools on the canvas: L (length) and W (width) — click where to cut, drag to
        spread.
      </p>
    </section>
  );
}
