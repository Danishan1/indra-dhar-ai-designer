import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { GarmentGallery } from '@/features/editor/canvas/garment-gallery';

export const metadata: Metadata = { title: 'Garment gallery' };

/** Dev-only: every render template × representative variants (I16). */
export default function GarmentGalleryPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <GarmentGallery />;
}
