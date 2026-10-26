import { type AcceptedMediaType, MediaTypes } from '@ai-designer/contracts';

/** Bytes needed to recognise every accepted format. */
export const SNIFF_BYTES = 4096;

const startsWith = (buf: Buffer, sig: number[], offset = 0) =>
  sig.every((b, i) => buf[offset + i] === b);

/**
 * Identifies a file by its content (magic bytes), never by its name or the client's MIME type
 * (FR-SEC-177). Returns null for anything not on the allowlist.
 */
export function sniffMediaType(head: Buffer): AcceptedMediaType | null {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return MediaTypes.png;
  if (startsWith(head, [0xff, 0xd8, 0xff])) return MediaTypes.jpeg;
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8))
    return MediaTypes.webp;
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return MediaTypes.pdf;
  if (looksLikeSvg(head)) return MediaTypes.svg;
  return null;
}

function looksLikeSvg(head: Buffer): boolean {
  // Text only: reject anything with NUL bytes (binary).
  if (head.includes(0)) return false;
  let text = head.toString('utf8').replace(/^\uFEFF/, '');
  // Skip XML declaration, comments, doctype and whitespace before the root element.
  text = text.replace(
    /^\s*(<\?xml[\s\S]*?\?>\s*)?((<!--[\s\S]*?-->|<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>)\s*)*/i,
    '',
  );
  return /^<svg[\s>]/i.test(text);
}

export function extensionFor(mediaType: AcceptedMediaType): string {
  switch (mediaType) {
    case MediaTypes.png:
      return 'png';
    case MediaTypes.jpeg:
      return 'jpg';
    case MediaTypes.webp:
      return 'webp';
    case MediaTypes.svg:
      return 'svg';
    case MediaTypes.pdf:
      return 'pdf';
  }
}
