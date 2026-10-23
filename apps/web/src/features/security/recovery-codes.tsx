'use client';

import { CopyIcon, DownloadIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

/** Shows recovery codes once, with copy/download. They are never shown again. */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = `AI Designer recovery codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join('\n')}\n`;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted-foreground">
        Save these recovery codes now. If you lose your phone, each code lets you sign in once. They
        won’t be shown again.
      </p>
      <ul
        className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border bg-muted/40 p-3 font-mono text-[13px]"
        aria-label="Recovery codes"
        data-testid="recovery-codes"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            void navigator.clipboard.writeText(codes.join('\n')).then(() => toast.success('Copied'))
          }
        >
          <CopyIcon aria-hidden /> Copy
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'ai-designer-recovery-codes.txt';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <DownloadIcon aria-hidden /> Download
        </Button>
        <Button type="button" size="sm" className="ml-auto" onClick={onDone}>
          I’ve saved them
        </Button>
      </div>
    </div>
  );
}
