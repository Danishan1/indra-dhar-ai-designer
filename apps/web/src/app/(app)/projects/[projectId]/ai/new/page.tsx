import type { Metadata } from 'next';

import { NewAnalysisPage } from '@/features/studio/new-analysis';

export const metadata: Metadata = { title: 'New design with AI' };

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <NewAnalysisPage projectId={projectId} />;
}
