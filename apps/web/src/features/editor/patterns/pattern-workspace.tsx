'use client';

import type { PatternPiece, PatternSpec } from '@ai-designer/garment-model';
import {
  draftPattern,
  draftToState,
  EDGE_LABELS,
  pieceDimensions,
  resizePiece,
  seamChecks,
} from '@ai-designer/pattern-model';
import { ImageIcon, PanelRightCloseIcon, RotateCcwIcon, ScissorsIcon } from 'lucide-react';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { assetContentUrl } from '@/features/assets/api';
import { useOrganization } from '@/features/organizations/organization-provider';
import { fmt, parseLength, type Unit } from '@/features/patterns/options';
import { PatternCanvas, type CanvasPiece } from '@/features/patterns/pattern-canvas';
import {
  ChecksList,
  GarmentBasics,
  MeasurementsForm,
  StyleForm,
  UnitToggle,
} from '@/features/patterns/pattern-forms';
import { cn } from '@/lib/utils';

import { useEditor } from '../store-context';

/**
 * Component 2 (ADR-058): the pattern editor. Pattern-first designs show only their flat pattern
 * pieces with dimensions, the sketch as a side reference, and three ways to change them:
 * measurements and style options (the whole pattern is redrafted and stays sewable), a piece's
 * width/height, or its key points (curves follow). Every change is a design operation (undo, save,
 * revisions).
 */

interface PatternUi {
  selected: string | null;
  setSelected: (id: string | null) => void;
  unit: Unit;
  setUnit: (u: Unit) => void;
}
const Ctx = createContext<PatternUi | null>(null);

export function PatternUiProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit>('cm');
  return <Ctx.Provider value={{ selected, setSelected, unit, setUnit }}>{children}</Ctx.Provider>;
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
  return (piece: PatternPiece, label: string) => {
    const own = (state.patternPieces ?? []).filter((p) => p.componentId === piece.componentId);
    apply(
      {
        type: 'replace_pattern_pieces',
        componentId: piece.componentId,
        pieces: own.map((p) => (p.pieceId === piece.pieceId ? piece : p)),
      },
      { label },
    );
  };
}

// ── left: pieces ─────────────────────────────────────────────────────────────

export function PatternPieceList() {
  const state = useEditor((s) => s.display);
  const { selected, setSelected } = usePatternUi();
  const pieces = state.patternPieces ?? [];
  const groups = state.components
    .filter((c) => c.parentComponentId !== null)
    .map((c) => ({ c, pieces: pieces.filter((p) => p.componentId === c.componentId) }))
    .filter((g) => g.pieces.length);
  return (
    <nav aria-label="Pattern pieces" className="flex min-h-0 flex-1 flex-col overflow-auto p-2 text-[13px]" data-testid="piece-list">
      {groups.map(({ c, pieces: list }) => (
        <div key={c.componentId} className="mb-2">
          <div className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{c.displayName}</div>
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
                <span className="rounded bg-status-needs-review/15 px-1 text-[10px] text-status-needs-review" title="Edited by hand — not redrafted">
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

export function PatternViewport() {
  const state = useEditor((s) => s.display);
  const canEdit = useEditor((s) => s.meta.capabilities.canEdit);
  const { selected, setSelected, unit, setUnit } = usePatternUi();
  const edit = useEditPiece();
  const { active } = useOrganization();
  const [refOpen, setRefOpen] = useState(true);
  const [only, setOnly] = useState(false);
  const pieces = useMemo(() => state.patternPieces ?? [], [state.patternPieces]);
  const sources = (state.sources ?? []).filter((s) => s.role === 'sketch' || s.role === 'reference');
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="pattern-workspace">
      <div className="flex items-center gap-2 border-b bg-panel/95 px-2 py-1 text-xs">
        <span className="font-medium">{pieces.length} pattern pieces</span>
        <UnitToggle unit={unit} onChange={setUnit} />
        <Button size="sm" variant="ghost" className={cn('h-6 px-2 text-xs', only && 'bg-accent')} aria-pressed={only} disabled={!selected} onClick={() => setOnly((v) => !v)}>
          Selected piece only
        </Button>
        <span className="ml-auto text-muted-foreground">
          {canEdit ? 'Select a piece, then drag a point or a blue handle' : 'Read only'}
        </span>
        {sources.length ? (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setRefOpen((v) => !v)} aria-pressed={refOpen} data-testid="toggle-reference">
            {refOpen ? <PanelRightCloseIcon /> : <ImageIcon />} Reference
          </Button>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1">
        <PatternCanvas
          className="flex-1"
          pieces={pieces}
          selectedId={selected}
          onSelect={setSelected}
          editable={canEdit}
          unit={unit}
          only={only ? selected : null}
          onChange={(p, label) => edit(p as PatternPiece, label)}
        />
        {refOpen && sources.length ? (
          <aside className="flex w-64 shrink-0 flex-col gap-2 overflow-auto border-l bg-muted/30 p-2" aria-label="Reference" data-testid="reference-panel">
            {sources.map((s) => (
              <figure key={s.assetId} className="flex flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={assetContentUrl(active.id, s.assetId, 'preview_1024')}
                  alt={s.label ?? 'Reference sketch'}
                  className="w-full rounded-md border bg-white object-contain"
                />
                <figcaption className="text-[11px] text-muted-foreground">{s.label ?? 'Sketch'}</figcaption>
              </figure>
            ))}
          </aside>
        ) : null}
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
          Fit{bad ? <span className="ml-1 rounded-full bg-destructive px-1 text-[10px] text-white">{bad}</span> : null}
        </TabsTrigger>
      </TabsList>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {edited.length ? (
          <div className="mb-3 rounded-md border border-status-needs-review/50 p-2 text-[12px]" data-testid="edited-banner">
            {edited.length} piece{edited.length === 1 ? ' was' : 's were'} edited by hand and {edited.length === 1 ? 'is' : 'are'} kept when you change sizes or style.
            <Button size="sm" variant="outline" className="mt-1.5 h-7 w-full text-xs" disabled={!canEdit} onClick={() => redraft(spec, 'Redraft all pieces', true)}>
              <RotateCcwIcon /> Redraft them from the measurements
            </Button>
          </div>
        ) : null}
        <TabsContent value="piece">
          {piece ? <PieceForm piece={piece} unit={unit} disabled={!canEdit} /> : <p className="text-[12px] text-muted-foreground">Select a piece on the pattern or in the list.</p>}
        </TabsContent>
        <TabsContent value="measurements" className="flex flex-col gap-3">
          <GarmentBasics spec={spec} disabled={!canEdit} onChange={(s, label) => redraft(s, label)} />
          <MeasurementsForm spec={spec} unit={unit} disabled={!canEdit} onChange={(s, label) => redraft(s, label)} />
        </TabsContent>
        <TabsContent value="style">
          <StyleForm spec={spec} disabled={!canEdit} onChange={(s, label) => redraft(s, label)} />
        </TabsContent>
        <TabsContent value="checks">
          <p className="mb-2 text-[12px] text-muted-foreground">Seams that are sewn together, measured on the pieces as they are now.</p>
          <ChecksList checks={checks} unit={unit} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

function PieceForm({ piece, unit, disabled }: { piece: PatternPiece; unit: Unit; disabled: boolean }) {
  const edit = useEditPiece();
  const state = useEditor((s) => s.display);
  const dims = pieceDimensions(piece);
  const [w, setW] = useState('');
  const [h, setH] = useState('');
  const resetPiece = () => {
    const draft = draftPattern(state.patternSpec!);
    const fresh = draftToState(state, draft, { redraftEdited: true }).patternPieces.find((p) => p.draft?.template === piece.draft?.template);
    if (fresh) edit({ ...fresh, pieceId: piece.pieceId, componentId: piece.componentId }, `Redraft ${piece.name}`);
  };
  const set = (patch: Partial<PatternPiece>, label: string) => edit({ ...piece, ...patch, source: 'user', status: 'needs_review' }, label);
  return (
    <div className="flex flex-col gap-3 text-[12px]" data-testid="piece-form">
      <div>
        <div className="text-sm font-semibold">{piece.name}</div>
        <div className="text-muted-foreground">
          {piece.source === 'user' ? 'Edited by hand' : 'Drafted from the measurements'} · cut {piece.cutQuantity}
          {piece.foldLine ? ' on the fold' : piece.mirrored ? ' as a mirrored pair' : ''}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ['Width', dims.width, w, setW, 'width'],
            ['Height', dims.height, h, setH, 'height'],
          ] as const
        ).map(([label, value, text, setText, key]) => (
          <label key={key} className="flex flex-col gap-1">
            <span>
              {label} ({unit})
            </span>
            <Input
              className="h-7 text-[12px]"
              inputMode="decimal"
              disabled={disabled}
              value={text || fmt(value, unit)}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => {
                const mm = parseLength(text, unit);
                setText('');
                if (mm && Math.abs(mm - value) > 0.5) edit(resizePiece(piece, { [key]: mm }), `${label} of ${piece.name}`);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              data-testid={`piece-input-${key}`}
            />
          </label>
        ))}
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
              if (Number.isFinite(v) && v >= 0 && v <= 50 && v !== piece.seamAllowanceMm) set({ seamAllowanceMm: v }, `Seam allowance of ${piece.name}`);
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
              if (v >= 1 && v <= 12 && v !== piece.cutQuantity) set({ cutQuantity: v }, `Cut quantity of ${piece.name}`);
            }}
          />
        </label>
      </div>
      <section>
        <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Seam lengths ({unit})</h3>
        <table className="w-full" data-testid="piece-edges">
          <tbody>
            {dims.edges.map((e) => (
              <tr key={`${e.name}-${e.mid.x}-${e.mid.y}`} className="border-b last:border-0">
                <td className="py-0.5">{EDGE_LABELS[e.name] ?? e.label}</td>
                <td className="py-0.5 text-right tabular-nums">{fmt(e.length, unit)}</td>
                <td className="py-0.5 pl-2 text-right text-muted-foreground tabular-nums">{e.intake ? `−${fmt(e.intake, unit)} darts/gathers` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

export type { CanvasPiece };
