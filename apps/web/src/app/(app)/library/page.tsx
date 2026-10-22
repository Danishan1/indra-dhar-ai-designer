import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: 'Library' };

export default function Page() {
  return (
    <PlaceholderPage
      title="Library"
      description="Reusable artifacts: components, materials, trims and prints."
      arrives="I13"
    />
  );
}
