import type { Metadata } from 'next';

import { SystemStatusPage } from '@/features/system/status-page';

export const metadata: Metadata = { title: 'System status' };

export default function Page() {
  return <SystemStatusPage />;
}
