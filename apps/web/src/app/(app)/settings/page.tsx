import type { Metadata } from 'next';

import { GeneralSettings } from '@/features/organizations/general-settings';

export const metadata: Metadata = { title: 'Organization settings' };

export default function Page() {
  return <GeneralSettings />;
}
