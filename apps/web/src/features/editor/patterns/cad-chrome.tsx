'use client';

import type { PatternPiece, PatternSpec } from '@ai-designer/garment-model';
import {
  layoutCanvas,
  type Lever,
  mirrorPiece,
  packCanvas,
  pieceBounds,
  type PieceDim,
  rotatePiece,
  solveLever,
  suggestLevers,
} from '@ai-designer/pattern-model';
import {
  DownloadIcon,
  FlipHorizontal2Icon,
  FlipVertical2Icon,
  Grid2x2CheckIcon,
  Grid3x3Icon,
  ImageIcon,
  LayoutGridIcon,
  MagnetIcon,
  MinusIcon,
  PackageIcon,
  PlusIcon,
  PrinterIcon,
  RotateCcwIcon,
  RotateCwIcon,
  RulerDimensionLineIcon,
  SquareDashedIcon,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { CadApi, CadSettings } from '@/features/patterns/cad/pattern-cad';
import { CATEGORIES, type CadTool, TOOLS } from '@/features/patterns/cad/tools';
import { fmt, parseLength, type Unit } from '@/features/patterns/options';
import { UnitToggle } from '@/features/patterns/pattern-forms';
import { cn } from '@/lib/utils';

import { useEditPiece, useEditPieces, usePatternUi, useRedraft } from './pattern-ui';

/**
 * Pattern editor chrome (ADR-062): the category bar above the canvas, the tool rail on its left,
 * and the options strip for the active tool or category (size by measurement, arrange, view &
 * output). Tools themselves live in the canvas (`PatternCad`).
 */

type SettingKey = 'snapGrid' | 'snapPoints' | 'showGrid' | 'showAllowance' | 'showDimensions';

export function CategoryBar({
  canEdit,
  cad,
}: {
  canEdit: boolean;
  cad: React.RefObject<CadApi | null>;
}) {
  const { category, setCategory, unit, setUnit } = usePatternUi();
  return (
    <div
      className="flex flex-wrap items-center gap-1 border-b bg-panel/95 px-2 py-1 text-xs"
      data-testid="cad-toolbar"
    >
      <div role="tablist" aria-label="Tool categories" className="flex flex-wrap gap-0.5">
        {CATEGORIES.map((c) => {
          const editsOnly = c.tools.every((t) => TOOLS[t].edits);
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={category === c.id}
              disabled={!canEdit && editsOnly}
              onClick={() => setCategory(c.id)}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] disabled:opacity-40',
                category === c.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              data-testid={`category-${c.id}`}
            >
              <c.icon className="size-3.5" aria-hidden />
              {c.label}
            </button>
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <UnitToggle unit={unit} onChange={setUnit} />
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
        </div>
      </div>
    </div>
  );
}

export function ToolRail({ canEdit, actions }: { canEdit: boolean; actions?: ReactNode }) {
  const { category, tool, setTool } = usePatternUi();
  const def = CATEGORIES.find((c) => c.id === category)!;
  return (
    <div
      role="toolbar"
      aria-label={`${def.label} tools`}
      aria-orientation="vertical"
      className="flex w-11 shrink-0 flex-col items-center gap-1 border-r bg-panel/95 py-2"
      data-testid="tool-rail"
    >
      {def.tools.map((t) => {
        const d = TOOLS[t];
        return (
          <Button
            key={t}
            size="icon-sm"
            variant="ghost"
            title={`${d.label} (${d.key})`}
            aria-label={d.label}
            aria-pressed={tool === t}
            disabled={!canEdit && d.edits}
            className={cn(
              'size-8',
              tool === t && 'bg-accent text-accent-foreground ring-1 ring-primary/40',
            )}
            onClick={() => setTool(t)}
            data-testid={`tool-${t}`}
          >
            <d.icon />
          </Button>
        );
      })}
      {actions ? (
        <div className="mt-1 flex flex-col items-center gap-1 border-t pt-2">{actions}</div>
      ) : null}
    </div>
  );
}

/** Rail buttons that act at once (no mode): flips, 90° turns, arrange. */
export function RailAction({
  label,
  icon: Icon,
  onClick,
  disabled,
  testId,
}: {
  label: string;
  icon: typeof RotateCwIcon;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      className="size-8"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      <Icon />
    </Button>
  );
}

/** Transform actions on the selected piece. */
export function TransformActions({
  piece,
  canEdit,
}: {
  piece: PatternPiece | null;
  canEdit: boolean;
}) {
  const edit = useEditPiece();
  const off = !piece || !canEdit;
  const keep = (p: PatternPiece) => (piece?.canvas ? { ...p, canvas: piece.canvas } : p);
  return (
    <>
      <RailAction
        label="Rotate 90° left"
        icon={RotateCcwIcon}
        disabled={off}
        onClick={() => piece && edit(keep(rotatePiece(piece, -90)), `Rotate ${piece.name} −90°`)}
        testId="rail-rotate-left"
      />
      <RailAction
        label="Rotate 90° right"
        icon={RotateCwIcon}
        disabled={off}
        onClick={() => piece && edit(keep(rotatePiece(piece, 90)), `Rotate ${piece.name} +90°`)}
        testId="rail-rotate-right"
      />
      <RailAction
        label="Flip horizontally"
        icon={FlipHorizontal2Icon}
        disabled={off}
        onClick={() =>
          piece && edit(keep(mirrorPiece(piece, 'vertical')), `Flip ${piece.name} horizontally`)
        }
        testId="rail-mirror-h"
      />
      <RailAction
        label="Flip vertically"
        icon={FlipVertical2Icon}
        disabled={off}
        onClick={() =>
          piece && edit(keep(mirrorPiece(piece, 'horizontal')), `Flip ${piece.name} vertically`)
        }
        testId="rail-mirror-v"
      />
    </>
  );
}

/** The line under the category bar: what the tool does, plus its options. */
export function OptionsStrip({ children }: { children?: ReactNode }) {
  const { tool, category } = usePatternUi();
  const hint =
    category === 'arrange'
      ? 'Lay the pieces out tightly within a fabric width (grain kept straight), or tidy them in rows by garment part. One undo step.'
      : category === 'view'
        ? 'What the canvas shows, true-size calibration and true-size outputs.'
        : TOOLS[tool].hint;
  return (
    <div
      className="flex min-h-8 flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-1 text-[12px]"
      data-testid="tool-options"
    >
      <span className="font-medium">
        {category === 'arrange'
          ? 'Arrange'
          : category === 'view'
            ? 'View & output'
            : TOOLS[tool].label}
      </span>
      <span className="text-muted-foreground">{hint}</span>
      {children ? (
        <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}

// ── arrange ──────────────────────────────────────────────────────────────────

export function useArrange(pieces: readonly PatternPiece[], fabricCm: number) {
  const editMany = useEditPieces();
  const packed = useMemo(
    () => packCanvas(pieces, { widthMm: fabricCm * 10, gapMm: 20 }),
    [pieces, fabricCm],
  );
  const pack = () => {
    const moved = pieces
      .map((p) => ({ p, at: packed.positions.get(p.pieceId)! }))
      .filter(({ p, at }) => !p.canvas || p.canvas.x !== at.x || p.canvas.y !== at.y)
      .map(({ p, at }) => ({ ...p, canvas: at }));
    editMany(moved, `Pack pieces on ${fabricCm} cm fabric`);
  };
  const tidy = () => {
    const fresh = layoutCanvas(pieces.map(({ canvas: _c, ...rest }) => rest as PatternPiece));
    editMany(
      pieces.map((p) => ({ ...p, canvas: fresh.get(p.pieceId)! })),
      'Tidy pieces in rows by part',
    );
  };
  return { pack, tidy, packed };
}

export function ArrangeOptions({
  fabricCm,
  onFabric,
  usedMm,
  unit,
  onPack,
  onTidy,
  canEdit,
}: {
  fabricCm: number;
  onFabric: (cm: number) => void;
  usedMm: number;
  unit: Unit;
  onPack: () => void;
  onTidy: () => void;
  canEdit: boolean;
}) {
  const [text, setText] = useState(String(fabricCm));
  return (
    <>
      <label className="flex items-center gap-1">
        Fabric width
        <input
          className="h-6 w-16 rounded border px-1 text-right"
          inputMode="decimal"
          aria-label="Fabric width (cm)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const v = Number(text.replace(',', '.'));
            if (v >= 30 && v <= 400) onFabric(v);
            else setText(String(fabricCm));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          data-testid="fabric-width"
        />
        cm
      </label>
      <span className="text-muted-foreground" data-testid="pack-length">
        needs {fmt(usedMm, unit)} {unit} of length
      </span>
      <Button
        size="sm"
        className="h-6 gap-1 px-2 text-xs"
        disabled={!canEdit}
        onClick={onPack}
        data-testid="arrange-pack"
      >
        <PackageIcon /> Pack on fabric
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-6 gap-1 px-2 text-xs"
        disabled={!canEdit}
        onClick={onTidy}
        data-testid="arrange-tidy"
      >
        <LayoutGridIcon /> Tidy by part
      </Button>
    </>
  );
}

// ── view & output ────────────────────────────────────────────────────────────

export function ViewOptions({
  settings,
  onSettings,
  onCalibrate,
  onPrint,
  onDxf,
  refOpen,
  onRef,
  hasRef,
}: {
  settings: CadSettings;
  onSettings: (s: CadSettings) => void;
  onCalibrate: () => void;
  onPrint: () => void;
  onDxf: () => void;
  refOpen: boolean;
  onRef: () => void;
  hasRef: boolean;
}) {
  const toggles: [SettingKey, string, typeof MagnetIcon][] = [
    ['snapPoints', 'Snap to points', MagnetIcon],
    ['snapGrid', 'Snap to grid', Grid2x2CheckIcon],
    ['showGrid', 'Show grid', Grid3x3Icon],
    ['showAllowance', 'Show seam allowance', SquareDashedIcon],
    ['showDimensions', 'Show dimensions on all pieces', RulerDimensionLineIcon],
  ];
  return (
    <>
      <div className="flex rounded-md border p-0.5" role="group" aria-label="Snapping and display">
        {toggles.map(([k, label, Icon]) => (
          <Button
            key={k}
            size="sm"
            variant="ghost"
            className={cn(
              'h-6 gap-1 px-2 text-xs',
              settings[k] && 'bg-accent text-accent-foreground',
            )}
            title={label}
            aria-label={label}
            aria-pressed={settings[k]}
            onClick={() => onSettings({ ...settings, [k]: !settings[k] })}
            data-testid={`toggle-${k}`}
          >
            <Icon /> {label.replace('Show ', '').replace(' on all pieces', '')}
          </Button>
        ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 text-xs"
        onClick={onCalibrate}
        data-testid="calibrate"
      >
        Calibrate 1:1
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-6 gap-1 px-2 text-xs"
        onClick={onPrint}
        title="Print at true size on A4 (tiled)"
        data-testid="print-1to1"
      >
        <PrinterIcon /> Print 1:1
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-6 gap-1 px-2 text-xs"
        onClick={onDxf}
        title="DXF for pattern CAD software and plotters"
        data-testid="export-dxf"
      >
        <DownloadIcon /> DXF
      </Button>
      {hasRef ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-2 text-xs"
          onClick={onRef}
          aria-pressed={refOpen}
          data-testid="toggle-reference"
        >
          <ImageIcon /> {refOpen ? 'Hide' : 'Show'} sketch
        </Button>
      ) : null}
    </>
  );
}

// ── size by measurement ──────────────────────────────────────────────────────

/**
 * Size by measurement (ADR-062): the selected piece's width or length is reached by changing the
 * measurement that drives it (suggested in order of effect), then every piece is redrafted.
 */
export function FitOptions({
  spec,
  piece,
  unit,
  canEdit,
}: {
  spec: PatternSpec;
  piece: PatternPiece | null;
  unit: Unit;
  canEdit: boolean;
}) {
  const redraft = useRedraft();
  const [dim, setDim] = useState<PieceDim>('width');
  const [leverId, setLeverId] = useState<string>('');
  const [target, setTarget] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const template = piece?.draft?.template ?? null;
  const levers = useMemo(
    () => (template ? suggestLevers(spec, template, dim) : []),
    [spec, template, dim],
  );
  if (!piece) return <span className="text-muted-foreground">Select a piece first.</span>;
  if (!template)
    return (
      <span className="text-muted-foreground">
        This piece was not drafted from measurements — use Scale instead.
      </span>
    );
  const b = pieceBounds(piece);
  const current = dim === 'width' ? b.width : b.height;
  const lever: Lever | undefined =
    levers.find((l) => l.lever.id === leverId)?.lever ?? levers[0]?.lever;
  const apply = () => {
    const mm = parseLength(target, unit);
    if (!lever || mm === null) return;
    const r = solveLever(spec, lever, template, dim, mm);
    if (!r) return;
    redraft(
      r.spec,
      `Size ${piece.name} ${dim} to ${fmt(mm, unit)} ${unit} via ${lever.label}`,
      piece.source === 'user',
    );
    setResult(
      `${lever.label}: ${fmt(lever.value, unit)} → ${fmt(r.value, unit)} ${unit}; ${piece.name} ${dim} now ${fmt(r.achieved, unit)} ${unit}` +
        (Math.abs(r.achieved - mm) > 1 ? ' (closest possible)' : ''),
    );
    setTarget('');
  };
  return (
    <>
      <select
        className="h-6 rounded border px-1"
        aria-label="Dimension"
        value={dim}
        onChange={(e) => setDim(e.target.value as PieceDim)}
        data-testid="fit-dimension"
      >
        <option value="width">Width</option>
        <option value="height">Length</option>
      </select>
      <span className="tabular-nums">
        now {fmt(current, unit)} {unit} →
      </span>
      <input
        className="h-6 w-20 rounded border px-1 text-right"
        inputMode="decimal"
        aria-label="Target size"
        placeholder={fmt(current, unit)}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply();
        }}
        data-testid="fit-target"
      />
      {unit} by changing
      <select
        className="h-6 max-w-56 rounded border px-1"
        aria-label="Measurement to change"
        value={lever?.id ?? ''}
        onChange={(e) => setLeverId(e.target.value)}
        data-testid="fit-lever"
      >
        {levers.map(({ lever: l, rate }) => (
          <option key={l.id} value={l.id}>
            {l.label} ({fmt(l.value, unit)} {unit}, ×{Math.abs(rate).toFixed(2)})
          </option>
        ))}
      </select>
      <Button
        size="sm"
        className="h-6 px-2 text-xs"
        disabled={!canEdit || !lever || !target}
        onClick={apply}
        data-testid="fit-apply"
      >
        Redraft
      </Button>
      {result ? (
        <span className="text-muted-foreground" data-testid="fit-result">
          {result}
        </span>
      ) : null}
    </>
  );
}

export type { CadTool };
