import type { Metadata } from 'next';

import { TechPackPage } from '@/features/studio/techpack-page';

export const metadata: Metadata = { title: 'Tech pack' };

export default async function Page({ params }: { params: Promise<{ techPackId: string }> }) {
  const { techPackId } = await params;
  return <TechPackPage techPackId={techPackId} />;
}
