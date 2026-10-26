import type { Metadata } from 'next';

import { DesignPage } from '@/features/designs/design-page';

export const metadata: Metadata = { title: 'Design' };

export default async function Page({ params }: { params: Promise<{ designId: string }> }) {
  const { designId } = await params;
  return <DesignPage designId={designId} />;
}
