'use client';

import type { Asset } from '@ai-designer/contracts';
import { FileTextIcon, ImageOffIcon, Loader2Icon, ShieldAlertIcon } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import { assetContentUrl } from './api';

/**
 * Thumbnail of an asset (256 px WebP derivative), streamed same-origin through the API so every
 * request is authorized; shows a placeholder while the file is checked, rejected or has no image.
 */
export function AssetThumbnail({
  orgId,
  asset,
  className,
  variant = 'thumb_256',
}: {
  orgId: string;
  asset: Pick<Asset, 'id' | 'status' | 'variants' | 'fileName' | 'mediaType' | 'displayId'>;
  className?: string;
  variant?: 'thumb_256' | 'preview_1024';
}) {
  const [failed, setFailed] = useState(false);
  const label = asset.fileName ?? asset.displayId;
  const frame = cn(
    'flex aspect-square items-center justify-center overflow-hidden rounded-md border bg-muted/40 text-muted-foreground',
    className,
  );

  if (asset.status === 'pending_upload' || asset.status === 'quarantined')
    return (
      <div className={frame} aria-label={`${label}: being checked`}>
        <Loader2Icon className="size-5 animate-spin" aria-hidden />
      </div>
    );
  if (asset.status === 'rejected')
    return (
      <div className={cn(frame, 'text-destructive')} aria-label={`${label}: rejected`}>
        <ShieldAlertIcon className="size-6" aria-hidden />
      </div>
    );
  if (!asset.variants.includes(variant) || failed)
    return (
      <div className={frame} aria-label={label}>
        {asset.mediaType === 'application/pdf' ? (
          <FileTextIcon className="size-6" aria-hidden />
        ) : (
          <ImageOffIcon className="size-6" aria-hidden />
        )}
      </div>
    );
  return (
    <div className={frame}>
      {/* eslint-disable-next-line @next/next/no-img-element -- authorized API stream, not a static asset */}
      <img
        src={assetContentUrl(orgId, asset.id, variant)}
        alt={label}
        loading="lazy"
        decoding="async"
        className="size-full object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
