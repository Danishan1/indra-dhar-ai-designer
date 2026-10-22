import type { Metadata } from 'next';

import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: 'Billing' };

export default function Page() {
  return (
    <PlaceholderPage
      title="Billing"
      description="Plan, usage, budgets and invoices."
      arrives="I30"
    />
  );
}
