'use client';

import { type TechPackDocument, techPackHtml } from '@ai-designer/design-ai';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  DownloadIcon,
  Loader2Icon,
  PrinterIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { PageHeader } from '@/components/shell/page-header';
import { ErrorState, LoadingState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import { assetContentUrl } from '@/features/assets/api';
import { designsApi } from '@/features/designs/api';
import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';

import { studioApi } from './api';

/**
 * A generated tech pack (Component 3, ADR-056): progress while the worker builds it, then the
 * document itself (the same printable HTML as the PDF, rendered without scripts) and the PDF.
 */
export function TechPackPage({ techPackId }: { techPackId: string }) {
  const { active } = useOrganization();
  const techPack = useQuery({
    queryKey: queryKeys.org(active.id).techPack(techPackId),
    queryFn: ({ signal }) => studioApi.techPack(active.id, techPackId, signal),
    refetchInterval: (q) =>
      q.state.data &&
      (q.state.data.status === 'queued' ||
        q.state.data.status === 'running' ||
        q.state.data.pdfStatus === 'printing')
        ? 1500
        : false,
  });
  const designId = techPack.data?.designId;
  const design = useQuery({
    queryKey: queryKeys.org(active.id).design(designId ?? ''),
    queryFn: ({ signal }) => designsApi.get(active.id, designId!, signal),
    enabled: !!designId,
  });
  // Same-origin, authorized stream → a real file download with a proper name in every browser.
  const download = useMutation({
    mutationFn: async (assetId: string) => {
      const res = await fetch(assetContentUrl(active.id, assetId, 'original'), {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`The PDF could not be downloaded (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${techPack.data?.displayId ?? 'tech-pack'}-${techPack.data?.revisionLabel ?? ''}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
  });
  const reprint = useMutation({
    mutationFn: () => studioApi.reprintPdf(active.id, techPackId),
    onSuccess: () => void techPack.refetch(),
  });
  /** Browser fallback: the complete document in a print window (Save as PDF). */
  const printInBrowser = () => {
    if (!html) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    w.document.write(
      html.replace(
        '</body>',
        '<script>window.onload=()=>setTimeout(()=>window.print(),300)</' + 'script></body>',
      ),
    );
    w.document.close();
  };
  const html = useMemo(() => {
    const doc = techPack.data?.document as TechPackDocument | null | undefined;
    if (!doc) return null;
    return techPackHtml(doc, (img) =>
      img.assetId ? assetContentUrl(active.id, img.assetId, 'preview_1024') : null,
    );
  }, [techPack.data?.document, active.id]);

  if (techPack.isPending) return <LoadingState />;
  if (techPack.isError)
    return <ErrorState error={techPack.error} onRetry={() => void techPack.refetch()} />;
  const tp = techPack.data;
  const editor = design.data
    ? `/projects/${design.data.projectId}/designs/${design.data.id}`
    : undefined;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={`Tech pack · ${design.data?.name ?? tp.displayId}`}
        description={`${tp.displayId} · revision ${tp.revisionLabel} · ${tp.provider}`}
        actions={
          <>
            {editor ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href={editor}>
                  <ArrowLeftIcon /> Back to the design
                </Link>
              </Button>
            ) : null}
            {tp.status === 'succeeded' ? (
              <Button
                size="sm"
                variant="outline"
                onClick={printInBrowser}
                data-testid="print-browser"
              >
                <PrinterIcon /> Print / Save as PDF
              </Button>
            ) : null}
            {tp.pdfStatus === 'ready' && tp.pdfAssetId ? (
              <Button
                size="sm"
                onClick={() => download.mutate(tp.pdfAssetId!)}
                disabled={download.isPending}
                data-testid="download-pdf"
              >
                <DownloadIcon /> {download.isPending ? 'Downloading…' : 'Download PDF'}
              </Button>
            ) : null}
          </>
        }
      />
      {tp.status === 'queued' || tp.status === 'running' ? (
        <div className="mx-auto flex max-w-xl flex-col items-center gap-3 p-10 text-center">
          <Loader2Icon className="size-8 animate-spin text-primary" aria-hidden />
          <p className="text-sm font-medium" role="status" data-testid="techpack-stage">
            {tp.stage ?? 'Working…'}
          </p>
          <p className="text-[13px] text-muted-foreground">
            The tech pack documents revision {tp.revisionLabel} exactly as committed — the design is
            not changed. Missing information is listed, never invented.
          </p>
        </div>
      ) : tp.status === 'failed' ? (
        <div className="mx-auto flex max-w-xl flex-col items-center gap-3 p-10 text-center">
          <AlertTriangleIcon className="size-8 text-destructive" aria-hidden />
          <p role="alert" className="text-sm">
            {tp.error?.message ?? 'Generation failed.'}
          </p>
        </div>
      ) : html ? (
        <div className="flex-1 bg-muted/40 p-4">
          {tp.pdfStatus === 'printing' ? (
            <p
              className="mb-2 flex items-center gap-2 text-[13px]"
              role="status"
              data-testid="pdf-printing"
            >
              <Loader2Icon className="size-4 animate-spin" /> Printing the PDF…
            </p>
          ) : tp.pdfStatus !== 'ready' ? (
            <div
              className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-status-needs-review/50 p-2 text-[13px]"
              data-testid="pdf-failed"
            >
              <span>
                The PDF could not be printed on the server{tp.pdfError ? `: ${tp.pdfError}` : '.'}{' '}
                The document below is complete.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => reprint.mutate()}
                disabled={reprint.isPending}
              >
                Print the PDF again
              </Button>
            </div>
          ) : null}
          {download.isError ? (
            <p role="alert" className="mb-2 text-[13px] text-destructive">
              {download.error.message}
            </p>
          ) : null}
          <iframe
            title="Tech pack document"
            srcDoc={html}
            sandbox="allow-same-origin"
            className="mx-auto block h-[calc(100vh-10rem)] w-full max-w-[900px] rounded-md border bg-white shadow-sm"
            data-testid="techpack-document"
          />
        </div>
      ) : null}
    </div>
  );
}
