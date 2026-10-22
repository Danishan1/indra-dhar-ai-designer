import type { Metadata } from 'next';
import { Suspense } from 'react';

import { VerifyEmail } from '@/features/auth/verify-email';

export const metadata: Metadata = { title: 'Confirm email' };

export default function Page() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
