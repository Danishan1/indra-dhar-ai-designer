import type { Metadata } from 'next';

import { SecurityPolicyPage } from '@/features/security/security-policy-page';

export const metadata: Metadata = { title: 'Security policy' };

export default function Page() {
  return <SecurityPolicyPage />;
}
