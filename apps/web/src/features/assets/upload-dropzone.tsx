'use client';

import type { Asset, AssetType } from '@ai-designer/contracts';
import { CheckCircle2Icon, Loader2Icon, UploadCloudIcon, XCircleIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { AssetThumbnail } from './asset-thumbnail';
import { acceptFor, type UploadItem, useUpload } from './use-upload';

const MB = 1024 * 1024;
const size = (bytes: number) =>
  bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const phaseText: Record<UploadItem['phase'], string> = {
  starting: 'Preparing…',
  uploading: 'Uploading…',
  processing: 'Checking file…',
  ready: 'Ready',
  rejected: 'Rejected',
  failed: 'Failed',
};

/**
 * Reusable drop zone (I09): drag & drop or browse, progress per file, type/size errors from the
 * API, and a thumbnail once the worker has checked the file.
 */
export function UploadDropzone({
  orgId,
  assetType,
  hint,
  disabled,
  onSettled,
}: {
  orgId: string;
  assetType: AssetType;
  hint?: string;
  disabled?: boolean;
  onSettled?: (asset: Asset) => void;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const { items, upload, clearFinished } = useUpload(orgId, {
    assetType,
    ...(onSettled ? { onSettled } : {}),
  });

  const take = (files: FileList | null) => {
    if (!files?.length || disabled) return;
    void upload(Array.from(files));
  };

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center transition-colors',
          over ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
          disabled && 'pointer-events-none opacity-50',
        )}
        data-testid="upload-dropzone"
      >
        <UploadCloudIcon className="size-8 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">Drop files here or click to browse</span>
        {hint ? <span className="text-[13px] text-muted-foreground">{hint}</span> : null}
        <input
          id={inputId}
          ref={input}
          type="file"
          multiple
          accept={acceptFor(assetType)}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = '';
          }}
        />
      </label>
      {items.length ? (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col divide-y rounded-lg border" aria-label="Uploads">
            {items.map((item) => (
              <li key={item.key} className="flex items-center gap-3 p-2" data-testid="upload-item">
                {item.asset ? (
                  <AssetThumbnail orgId={orgId} asset={item.asset} className="size-12 shrink-0" />
                ) : (
                  <div className="size-12 shrink-0 rounded-md border bg-muted/40" />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate font-medium">{item.fileName}</span>
                    <span className="shrink-0 text-muted-foreground">{size(item.size)}</span>
                  </div>
                  {item.phase === 'uploading' ? (
                    <div
                      className="h-1.5 overflow-hidden rounded bg-muted"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(item.progress * 100)}
                      aria-label={`Uploading ${item.fileName}`}
                    >
                      <div
                        className="h-full bg-primary transition-[width]"
                        style={{ width: `${Math.round(item.progress * 100)}%` }}
                      />
                    </div>
                  ) : null}
                  <span
                    className={cn(
                      'flex items-center gap-1 text-xs',
                      item.phase === 'ready' && 'text-status-ok',
                      (item.phase === 'rejected' || item.phase === 'failed') && 'text-destructive',
                      !['ready', 'rejected', 'failed'].includes(item.phase) &&
                        'text-muted-foreground',
                    )}
                    data-testid="upload-status"
                  >
                    {item.phase === 'ready' ? (
                      <CheckCircle2Icon className="size-3.5" aria-hidden />
                    ) : item.phase === 'rejected' || item.phase === 'failed' ? (
                      <XCircleIcon className="size-3.5" aria-hidden />
                    ) : (
                      <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
                    )}
                    {phaseText[item.phase]}
                    {item.error ? ` — ${item.error}` : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="ghost" className="self-end" onClick={clearFinished}>
            Clear finished
          </Button>
        </div>
      ) : null}
    </div>
  );
}
