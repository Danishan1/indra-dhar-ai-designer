import type { Metadata } from 'next';

import { ProjectsDashboard } from '@/features/projects/dashboard';

export const metadata: Metadata = { title: 'Projects' };

export default function Page() {
  return <ProjectsDashboard />;
}
