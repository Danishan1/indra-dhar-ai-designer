import { type AcceptedMediaType, type AssetVariant, MediaTypes } from '@ai-designer/contracts';
import sharp, { type Metadata } from 'sharp';

export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  colorSpace: string | null;
  hasAlpha: boolean;
}

export interface Derivative {
  variant: Exclude<AssetVariant, 'original'>;
  buffer: Buffer;
  mediaType: 'image/webp';
  width: number;
  height: number;
}

export class ImageRejectedError extends Error {}

const DERIVATIVES: { variant: Exclude<AssetVariant, 'original'>; size: number; quality: number }[] =
  [
    { variant: 'thumb_256', size: 256, quality: 78 },
    { variant: 'preview_1024', size: 1024, quality: 82 },
  ];

/**
 * Reads image metadata with a pixel ceiling (decompression-bomb protection, AST-008). Throws
 * ImageRejectedError for unreadable or oversized images.
 */
export async function inspectImage(buffer: Buffer, maxPixels: number): Promise<ImageInfo> {
  let meta: Metadata;
  try {
    meta = await sharp(buffer, { limitInputPixels: maxPixels, failOn: 'error' }).metadata();
  } catch (err) {
    throw new ImageRejectedError(`unreadable image: ${(err as Error).message}`);
  }
  const { width, height } = meta;
  if (!width || !height) throw new ImageRejectedError('image has no dimensions');
  if (width * height > maxPixels)
    throw new ImageRejectedError(`image too large: ${width}×${height} exceeds ${maxPixels} pixels`);
  return {
    width,
    height,
    format: meta.format ?? 'unknown',
    colorSpace: meta.space ?? null,
    hasAlpha: meta.hasAlpha ?? false,
  };
}

/**
 * Thumbnail (256) and preview (1024) as WebP: EXIF orientation applied, all metadata (EXIF, GPS,
 * ICC except sRGB conversion) stripped — derived variants never leak camera data.
 */
export async function makeDerivatives(
  buffer: Buffer,
  mediaType: AcceptedMediaType,
  maxPixels: number,
): Promise<Derivative[]> {
  if (mediaType === MediaTypes.pdf) return [];
  const out: Derivative[] = [];
  for (const d of DERIVATIVES) {
    const { data, info } = await sharp(buffer, {
      limitInputPixels: maxPixels,
      failOn: 'error',
      ...(mediaType === MediaTypes.svg ? { density: 144 } : {}),
    })
      .rotate()
      .resize(d.size, d.size, { fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb')
      .webp({ quality: d.quality })
      .toBuffer({ resolveWithObject: true });
    out.push({
      variant: d.variant,
      buffer: data,
      mediaType: 'image/webp',
      width: info.width,
      height: info.height,
    });
  }
  return out;
}
