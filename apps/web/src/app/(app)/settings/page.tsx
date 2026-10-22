import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: 'Settings' };

export default function Page() {
  return (
    <PlaceholderPage
      title="Settings"
      description="Your account, security and organization settings."
      arrives="I05–I08"
    />
  );
}
