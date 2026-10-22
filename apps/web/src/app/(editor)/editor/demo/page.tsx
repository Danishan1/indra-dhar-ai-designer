import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EditorWorkspace } from '@/features/editor/editor-workspace';

export const metadata: Metadata = { title: 'Editor layout' };

/** Dev-only preview of the editor regions (I04); the real editor route arrives in I15. */
export default function EditorDemoPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <EditorWorkspace title="Demo design" />;
}
