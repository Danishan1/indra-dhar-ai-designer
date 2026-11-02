import type { Metadata } from 'next';

import { AnalysisReviewPage } from '@/features/studio/analysis-review';

export const metadata: Metadata = { title: 'Design analysis' };

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string; analysisId: string }>;
}) {
  const { projectId, analysisId } = await params;
  return <AnalysisReviewPage projectId={projectId} analysisId={analysisId} />;
}
