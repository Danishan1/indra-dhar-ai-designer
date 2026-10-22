import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: 'Admin' };

export default function Page() {
  return <PlaceholderPage title="Admin" description="Platform administration." arrives="I45" />;
}
