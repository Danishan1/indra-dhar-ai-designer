import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: 'Projects' };

export default function Page() {
  return (
    <PlaceholderPage
      title="Projects"
      description="Design projects, lifecycle and collaborators."
      arrives="I10"
    />
  );
}
