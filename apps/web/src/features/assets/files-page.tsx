'use client';

import {
  type Asset,
  type AssetType,
  uploadableAssetTypes,
  UPLOAD_RULES,
} from '@ai-designer/contracts';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DownloadIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/select';
import { useOrganization } from '@/features/organizations/organization-provider';
import { toastApiError } from '@/lib/api/toast-error';
import { queryKeys } from '@/lib/query/keys';

import { assetsApi } from './api';
import { AssetThumbnail } from './asset-thumbnail';
import { UploadDropzone } from './upload-dropzone';
import { rejectionText } from './use-upload';

const TYPE_LABELS: Record<string, string> = {
  source_image: 'Source image',
  sketch: 'Sketch',
  fabric_image: 'Fabric image',
  artwork: 'Artwork',
  document: 'Document (PDF)',
  svg: 'SVG',
  texture: 'Texture',
  mask: 'Mask',
};
const typeLabel = (t: string) => TYPE_LABELS[t] ?? t.replace(/_/g, ' ');
const EXT: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
  'image/svg+xml': 'SVG',
  'application/pdf': 'PDF',
};

/**
 * Files (I09 dev page): upload and browse the organization's files. Temporary — merged into
 * project sources in I10.
 */
export function FilesPage() {
  const { active, can } = useOrganization();
  const queryClient = useQueryClient();
  const [assetType, setAssetType] = useState<AssetType>('source_image');
  const [filter, setFilter] = useState('all');
  const filters = filter === 'all' ? {} : { type: filter };

  const assets = useInfiniteQuery({
    queryKey: queryKeys.org(active.id).assets(filters),
    queryFn: ({ pageParam, signal }) =>
      assetsApi.list(active.id, filters, pageParam ?? undefined, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.org(active.id).assets() }),
    [queryClient, active.id],
  );
  const onSettled = useCallback(() => void refresh(), [refresh]);

  const remove = useMutation({
    mutationFn: (asset: Asset) => assetsApi.remove(active.id, asset.id),
    onSuccess: async () => {
      toast.success('File deleted');
      await refresh();
    },
  });
  const download = async (asset: Asset) => {
    try {
      const { url } = await assetsApi.signedUrl(active.id, asset.id, 'original');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toastApiError(err);
    }
  };

  const items = assets.data?.pages.flatMap((p) => p.items) ?? [];
  const accepted = (UPLOAD_RULES[assetType] ?? []).map((m) => EXT[m] ?? m).join(', ');

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Files"
        description={`Images, sketches, artwork and documents in ${active.name}. Files are checked before they can be used.`}
      />
      <div className="flex flex-col gap-6 p-6">
        {can('asset.upload') ? (
          <section className="flex flex-col gap-3" aria-labelledby="upload-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="upload-heading" className="text-sm font-semibold">
                Upload
              </h2>
              <div className="flex items-center gap-2">
                <Label htmlFor="upload-kind" className="text-[13px]">
                  Kind of file
                </Label>
                <SimpleSelect
                  id="upload-kind"
                  className="w-44"
                  value={assetType}
                  onValueChange={(v) => setAssetType(v as AssetType)}
                  options={uploadableAssetTypes.map((t) => ({ value: t, label: typeLabel(t) }))}
                />
              </div>
            </div>
            <UploadDropzone
              orgId={active.id}
              assetType={assetType}
              hint={`${accepted}. Images up to 25 MB, SVG up to 2 MB, PDF up to 50 MB.`}
              onSettled={onSettled}
            />
          </section>
        ) : null}

        <section className="flex flex-col gap-3" aria-labelledby="files-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="files-heading" className="text-sm font-semibold">
              All files
            </h2>
            <div className="flex items-center gap-2">
              <Label htmlFor="files-filter" className="text-[13px]">
                Show
              </Label>
              <SimpleSelect
                id="files-filter"
                className="w-44"
                value={filter}
                onValueChange={setFilter}
                options={[
                  { value: 'all', label: 'All kinds' },
                  ...uploadableAssetTypes.map((t) => ({ value: t, label: typeLabel(t) })),
                ]}
              />
            </div>
          </div>
          {assets.isPending ? (
            <LoadingState />
          ) : assets.isError ? (
            <ErrorState error={assets.error} onRetry={() => void assets.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState
              title="No files yet"
              description="Upload a sketch, photo or fabric image to get started."
            />
          ) : (
            <ul
              className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3"
              aria-label="Files"
            >
              {items.map((asset) => (
                <li
                  key={asset.id}
                  className="group flex flex-col gap-2 rounded-lg border p-2"
                  data-testid="asset-card"
                >
                  <AssetThumbnail orgId={active.id} asset={asset} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] font-medium" title={asset.fileName ?? ''}>
                      {asset.fileName ?? asset.displayId}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {typeLabel(asset.assetType)}
                      {asset.dimensions
                        ? ` · ${asset.dimensions.width}×${asset.dimensions.height}`
                        : ''}
                    </span>
                    {asset.status === 'rejected' ? (
                      <span className="text-xs text-destructive">
                        {rejectionText(asset.rejectionReason)}
                      </span>
                    ) : asset.status !== 'ready' ? (
                      <span className="text-xs text-muted-foreground">Being checked…</span>
                    ) : null}
                  </div>
                  <div className="flex gap-1">
                    {asset.status === 'ready' ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Download ${asset.fileName ?? asset.displayId}`}
                        onClick={() => void download(asset)}
                      >
                        <DownloadIcon />
                      </Button>
                    ) : null}
                    {can('asset.delete') ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${asset.fileName ?? asset.displayId}`}
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(asset)}
                      >
                        <Trash2Icon />
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {assets.hasNextPage ? (
            <Button
              variant="outline"
              size="sm"
              className="self-center"
              disabled={assets.isFetchingNextPage}
              onClick={() => void assets.fetchNextPage()}
            >
              Load more
            </Button>
          ) : null}
        </section>
      </div>
    </div>
  );
}
