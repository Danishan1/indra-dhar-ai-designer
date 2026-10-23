import type { Metadata } from 'next';

import { SecurityPage } from '@/features/security/security-page';

export const metadata: Metadata = { title: 'Your security' };

export default function Page() {
  return <SecurityPage />;
}
