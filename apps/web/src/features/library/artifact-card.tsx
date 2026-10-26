'use client';

import type { Artifact } from '@ai-designer/contracts';
import { ImageOffIcon } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';

import { CAPABILITY_LABELS, SCOPE_LABELS } from './labels';

export function ArtifactPreview({
  url,
  label,
  className,
}: {
  url: string | null;
  label: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`flex aspect-square items-center justify-center overflow-hidden rounded-md border bg-white text-muted-foreground dark:bg-slate-100 ${className ?? ''}`}
    >
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- authorized API stream, not a static asset
        <img
          src={url}
          alt={label}
          loading="lazy"
          className="size-full object-contain p-2"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageOffIcon className="size-6" aria-label={`${label}: no preview`} />
      )}
    </div>
  );
}

export function ArtifactCard({ artifact, onOpen }: { artifact: Artifact; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="artifact-card"
      className="flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <ArtifactPreview url={artifact.previewUrl} label={artifact.name} />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-[13px] font-medium" title={artifact.name}>
          {artifact.name}
        </span>
        <span className="text-[11px] text-muted-foreground">{artifact.displayId}</span>
        <span className="flex flex-wrap gap-1">
          <Badge variant={artifact.ownerScope === 'platform' ? 'secondary' : 'outline'}>
            {SCOPE_LABELS[artifact.ownerScope]}
          </Badge>
          {artifact.lifecycleStatus !== 'active' ? (
            <Badge variant="outline">Deactivated</Badge>
          ) : null}
          {artifact.geometryCapability ? (
            <Badge variant="outline" title="Geometry available">
              {CAPABILITY_LABELS[artifact.geometryCapability]}
            </Badge>
          ) : null}
        </span>
      </div>
    </button>
  );
}
