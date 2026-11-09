'use client';

import { LOOK_STYLE_VIEWS, type LookStyle, type LookView } from '@ai-designer/contracts';
import { designGarments } from '@ai-designer/pattern-model';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, PenLineIcon, ShirtIcon, UserRoundIcon } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/select';
import { newIdempotencyKey } from '@/features/designs/api';
import { useOrganization } from '@/features/organizations/organization-provider';
import { studioApi } from '@/features/studio/api';
import { toApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query/keys';
import { cn } from '@/lib/utils';

import { usePatternRightTab } from '../patterns/pattern-right-panel';
import { useRevisionsApi } from '../revisions/use-revisions';
import { selectHasUnsavedWork } from '../store';
import { useEditor, useEditorStore } from '../store-context';

const VIEW_LABEL: Record<LookView, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left side',
  right: 'Right side',
};

const rev = (n: number | undefined) => (n ? `R${String(n).padStart(3, '0')}` : '—');

/**
 * "Preview look" (ADR-064): the garment as it would look sewn from the patterns on screen, drawn by
 * the image model from the sides the user picks (each view is one paid AI image). A look always belongs to a committed
 * revision, so uncommitted pattern changes are committed first (one step) — that is what lets the
 * designer come back to the patterns of any earlier look.
 */
export function LookButton() {
  const { can } = useOrganization();
  const [open, setOpen] = useState(false);
  const patternFirst = useEditor((s) => !!s.display.patternSpec);
  if (!patternFirst || !can('design.generate')) return null;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => setOpen(true)}
        data-testid="look-button"
      >
        <ShirtIcon aria-hidden /> Preview look
      </Button>
      {open ? <LookDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function LookDialog({ onClose }: { onClose: () => void }) {
  const { active } = useOrganization();
  const store = useEditorStore();
  const queryClient = useQueryClient();
  const designId = useEditor((s) => s.meta.design.id);
  const head = useEditor((s) => s.meta.headRevision);
  const uncommitted = useEditor((s) => s.server.hasUncommittedChanges || selectHasUnsavedWork(s));
  const canEdit = useEditor((s) => s.meta.capabilities.canEdit);
  const revisions = useRevisionsApi();
  const setTab = usePatternRightTab((s) => s.setTab);
  const spec = useEditor((s) => s.display.patternSpec);
  const garments = useMemo(() => (spec ? designGarments(spec) : []), [spec]);
  // Nothing is chosen until the user picks the kind of look; its views then appear.
  const [style, setStyle] = useState<LookStyle | null>(null);
  const [views, setViews] = useState<LookView[]>(['front']);
  const allowed = style ? LOOK_STYLE_VIEWS[style] : [];
  const picked = views.filter((v) => allowed.includes(v));
  const toggle = (v: LookView) =>
    setViews((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  const perView = style === 'sketch' ? Math.max(1, garments.length) : 1;
  const images = picked.length * perView;
  const [note, setNote] = useState('');
  const [provider, setProvider] = useState('');
  const [commitKey] = useState(() => globalThis.crypto.randomUUID());
  const key = useRef(newIdempotencyKey());
  const willCommit = uncommitted && canEdit;

  const status = useQuery({
    queryKey: queryKeys.org(active.id).aiStatus(),
    queryFn: ({ signal }) => studioApi.aiStatus(active.id, signal),
  });
  const chosen = provider || status.data?.defaultProvider || '';
  const configured = (status.data?.providers ?? []).filter((p) => p.configured);
  const noRevision = !head && !willCommit;

  const generate = useMutation({
    mutationFn: async () => {
      await store.getState().flush();
      // Commit whenever there was unsaved or uncommitted work (NO_CHANGES is fine).
      if (willCommit) {
        try {
          await revisions.commit(
            {
              expectedVersion: store.getState().server.version,
              summary: note.trim() ? `Look preview: ${note.trim()}` : 'Patterns for a look preview',
              allowNoChanges: false,
            },
            commitKey,
          );
        } catch (e) {
          if (toApiError(e).code !== 'NO_CHANGES') throw e;
        }
        await store.getState().reloadFromServer();
        await queryClient.invalidateQueries({
          queryKey: queryKeys.org(active.id).revisions(designId),
        });
      }
      return studioApi.createLook(
        active.id,
        designId,
        {
          style: style ?? 'model',
          views: picked,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(chosen ? { provider: chosen as 'gemini' | 'openai' | 'fake' } : {}),
        },
        key.current,
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(active.id).looks(designId) });
      setTab('looks');
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Preview the look</DialogTitle>
          <DialogDescription>
            The AI draws the garment sewn from the patterns of revision{' '}
            {rev(willCommit ? (head?.revisionNumber ?? 0) + 1 : head?.revisionNumber)}. The look is
            kept with those patterns, so you can come back to them later.
          </DialogDescription>
        </DialogHeader>
        {uncommitted ? (
          <p
            className="rounded-md border border-status-needs-review/50 p-2 text-[13px]"
            data-testid="look-uncommitted"
          >
            {canEdit
              ? `Your latest pattern changes will be saved as revision ${rev((head?.revisionNumber ?? 0) + 1)} first.`
              : `Your latest changes are not committed; the look shows ${rev(head?.revisionNumber)}.`}
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">What should it show?</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kind of look">
              <KindCard
                id="model"
                selected={style === 'model'}
                onSelect={() => setStyle('model')}
                icon={UserRoundIcon}
                title="On a model"
                text="The outfit worn by a model. Front, back, left and right."
              />
              <KindCard
                id="sketch"
                selected={style === 'sketch'}
                onSelect={() => setStyle('sketch')}
                icon={PenLineIcon}
                title="Line sketch"
                text={
                  garments.length > 1
                    ? `A flat drawing of each garment (${garments.map((g) => g.name.toLowerCase()).join(', ')}), no model. Front and back.`
                    : 'A flat line drawing of the garment, no model or dummy. Front and back.'
                }
              />
            </div>
          </div>
          {style ? (
            <fieldset className="flex flex-col gap-1.5" data-testid="look-views">
              <legend className="mb-1.5 flex w-full items-center justify-between text-sm font-medium">
                Views
                <span
                  className="text-[12px] font-normal text-muted-foreground"
                  data-testid="look-cost"
                >
                  {images} AI {images === 1 ? 'image' : 'images'}
                </span>
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {allowed.map((v) => {
                  const on = picked.includes(v);
                  return (
                    <Button
                      key={v}
                      type="button"
                      size="sm"
                      variant={on ? 'default' : 'outline'}
                      aria-pressed={on}
                      className={cn('h-7 gap-1 px-2 text-xs', !on && 'text-muted-foreground')}
                      onClick={() => toggle(v)}
                      data-testid={`look-pick-${v}`}
                    >
                      {on ? <CheckIcon aria-hidden /> : null}
                      {VIEW_LABEL[v]}
                    </Button>
                  );
                })}
                {allowed.length > 2 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      setViews(picked.length === allowed.length ? ['front'] : [...allowed])
                    }
                    data-testid="look-pick-all"
                  >
                    {picked.length === allowed.length ? 'Front only' : 'All four'}
                  </Button>
                ) : null}
              </div>
              <p className="text-[12px] text-muted-foreground">
                {style === 'sketch' && perView > 1
                  ? `Each view is drawn for every garment: ${perView} AI images per view.`
                  : 'Each view is one AI image. Start with the front; add the others when you need them.'}
              </p>
            </fieldset>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="look-note">Note (optional)</Label>
            <Input
              id="look-note"
              value={note}
              maxLength={200}
              placeholder="e.g. longer sleeves, wider leg"
              onChange={(e) => setNote(e.target.value)}
              data-testid="look-note"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="look-provider">AI provider</Label>
            <SimpleSelect
              id="look-provider"
              value={chosen}
              onValueChange={setProvider}
              options={configured.map((p) => ({
                value: p.name,
                label:
                  p.name === 'fake'
                    ? 'Demo (offline, no real AI)'
                    : `${p.name} · ${p.models.image}`,
              }))}
            />
          </div>
        </div>
        {noRevision ? (
          <p className="text-[13px] text-muted-foreground">
            Commit the patterns first — a look always shows committed patterns.
          </p>
        ) : null}
        {generate.isError ? (
          <p role="alert" className="text-[13px] text-destructive">
            {generate.error.message}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => generate.mutate()}
            disabled={generate.isPending || noRevision || !chosen || !style || images === 0}
            data-testid="look-generate"
          >
            {generate.isPending
              ? 'Starting…'
              : !style
                ? 'Choose what to show'
                : images === 0
                  ? 'Choose a view'
                  : `Draw ${images} ${images === 1 ? 'image' : 'images'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KindCard({
  id,
  selected,
  onSelect,
  icon: Icon,
  title,
  text,
}: {
  id: string;
  selected: boolean;
  onSelect: () => void;
  icon: typeof ShirtIcon;
  title: string;
  text: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      data-testid={`look-kind-${id}`}
      className={cn(
        'flex flex-col items-start gap-1 rounded-md border p-2.5 text-left transition-colors',
        selected ? 'border-primary bg-primary/10' : 'hover:bg-accent',
      )}
    >
      <span className="flex items-center gap-1.5 text-[13px] font-medium">
        <Icon className="size-4" aria-hidden /> {title}
      </span>
      <span className="text-[12px] text-muted-foreground">{text}</span>
    </button>
  );
}
