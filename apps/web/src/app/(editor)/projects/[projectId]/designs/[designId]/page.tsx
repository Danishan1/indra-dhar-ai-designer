import type { Metadata } from 'next';

import { EditorPage } from '@/features/editor/editor-page';

export const metadata: Metadata = { title: 'Editor' };

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string; designId: string }>;
}) {
  const { projectId, designId } = await params;
  return <EditorPage projectId={projectId} designId={designId} />;
}
