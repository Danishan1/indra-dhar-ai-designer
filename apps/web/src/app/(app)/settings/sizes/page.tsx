import type { Metadata } from 'next';

import { SizeChartsPage } from '@/features/sizes/size-charts-page';

export const metadata: Metadata = { title: 'Size charts' };

export default function Page() {
  return <SizeChartsPage />;
}
