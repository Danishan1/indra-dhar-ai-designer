'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { useEditor } from '../store-context';

/**
 * A newer version exists on the server (409). Nothing was overwritten (AC-EDT-011); the person picks:
 * reload (discard my unsaved changes), re-apply my changes on top, or decide later (stays in conflict).
 */
export function ConflictDialog() {
  const conflict = useEditor((s) => s.conflict);
  const pending = useEditor((s) => s.queue.queued.length + (s.queue.inFlight?.ops.length ?? 0));
  const setOpen = useEditor((s) => s.setConflictDialogOpen);
  const reload = useEditor((s) => s.reloadFromServer);
  const reapply = useEditor((s) => s.reapplyMine);
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!conflict?.dialogOpen} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>This design changed elsewhere</DialogTitle>
          <DialogDescription>
            Someone (or another tab) saved a newer version
            {conflict?.currentVersion ? ` (version ${conflict.currentVersion})` : ''}. Nothing was
            overwritten. You have {pending === 1 ? '1 change' : `${pending} changes`} that are not
            saved yet.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="outline" disabled={busy} onClick={run(reload)}>
            Reload server version
          </Button>
          <Button disabled={busy || pending === 0} onClick={run(reapply)}>
            Re-apply my changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
