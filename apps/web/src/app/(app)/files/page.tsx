import type { Metadata } from 'next';

import { FilesPage } from '@/features/assets/files-page';

export const metadata: Metadata = { title: 'Files' };

export default function Page() {
  return <FilesPage />;
}
