import type { Metadata } from 'next';

import { AiSettingsPage } from '@/features/studio/ai-settings-page';

export const metadata: Metadata = { title: 'AI models' };

export default function Page() {
  return <AiSettingsPage />;
}
