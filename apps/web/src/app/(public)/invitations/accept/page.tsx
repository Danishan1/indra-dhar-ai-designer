import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AcceptInvitation } from '@/features/organizations/accept-invitation';

export const metadata: Metadata = { title: 'Invitation' };

export default function Page() {
  return (
    <Suspense>
      <AcceptInvitation />
    </Suspense>
  );
}
