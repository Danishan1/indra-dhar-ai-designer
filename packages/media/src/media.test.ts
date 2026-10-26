import { MediaTypes } from '@ai-designer/contracts';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { ImageRejectedError, inspectImage, makeDerivatives } from './images.js';
import { assetObjectKey, keyBelongsTo } from './keys.js';
import { EicarTestScanner } from './scanner.js';
import { sniffMediaType } from './sniff.js';
import { sanitizeSvg } from './svg-sanitize.js';

const ORG = '019a0000-0000-7000-8000-000000000001';
const ASSET = '019a0000-0000-7000-8000-0000000000aa';

const png = () =>
  sharp({ create: { width: 40, height: 20, channels: 3, background: '#c33' } })
    .png()
    .toBuffer();

describe('sniffMediaType (FR-SEC-177)', () => {
  it('recognises accepted formats by content', async () => {
    expect(sniffMediaType(await png())).toBe(MediaTypes.png);
    expect(
      sniffMediaType(
        await sharp(await png())
          .jpeg()
          .toBuffer(),
      ),
    ).toBe(MediaTypes.jpeg);
    expect(
      sniffMediaType(
        await sharp(await png())
          .webp()
          .toBuffer(),
      ),
    ).toBe(MediaTypes.webp);
    expect(sniffMediaType(Buffer.from('%PDF-1.7\n...'))).toBe(MediaTypes.pdf);
    expect(
      sniffMediaType(
        Buffer.from('<?xml version="1.0"?>\n<!-- c -->\n<svg xmlns="http://www.w3.org/2000/svg"/>'),
      ),
    ).toBe(MediaTypes.svg);
  });

  it('rejects spoofed or unknown content regardless of name', () => {
    expect(sniffMediaType(Buffer.from('MZ\x90\x00 windows exe'))).toBeNull();
    expect(sniffMediaType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(sniffMediaType(Buffer.from('GIF89a....'))).toBeNull();
    expect(sniffMediaType(Buffer.from([0x3c, 0x73, 0x76, 0x67, 0x00]))).toBeNull(); // "<svg\0" binary
  });
});

describe('sanitizeSvg (FR-RV-035/036)', () => {
  const dirty = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)">
    <script>alert(2)</script>
    <foreignObject><div>html</div></foreignObject>
    <a xlink:href="javascript:alert(3)"><rect width="10" height="10" onclick="x()"/></a>
    <use xlink:href="http://evil.example/sprite.svg#a"/>
    <use href="#local"/>
    <image href="https://evil.example/track.png"/>
    <rect id="local" style="fill: url(http://evil.example/p)" width="5" height="5"/>
    <style>@import url(https://evil.example/x.css); rect { fill: red }</style>
  </svg>`;

  it('removes scripts, handlers, foreignObject and external references', () => {
    const { svg, removed } = sanitizeSvg(dirty);
    expect(removed).toBeGreaterThan(0);
    for (const bad of [
      '<script',
      'onload',
      'onclick',
      'foreignObject',
      'javascript:',
      'evil.example',
      '@import',
    ]) {
      expect(svg).not.toContain(bad);
    }
    expect(svg).toContain('href="#local"');
    expect(svg).toMatch(/^<svg/);
  });

  it('leaves clean drawings intact', () => {
    const clean =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 10" stroke="black"/></svg>';
    const { svg, removed } = sanitizeSvg(clean);
    expect(removed).toBe(0);
    expect(svg).toContain('<path d="M0 0L10 10"');
  });
});

describe('storage keys (AST-009)', () => {
  it('prefix every key with the organization', () => {
    const key = assetObjectKey(ORG, ASSET, 'thumb_256', new Date('2026-03-04T00:00:00Z'));
    expect(key).toBe(`org/${ORG}/2026/03/${ASSET}/thumb_256`);
    expect(keyBelongsTo(ORG, key)).toBe(true);
    expect(keyBelongsTo('019a0000-0000-7000-8000-000000000002', key)).toBe(false);
    expect(() => assetObjectKey('../../etc', ASSET, 'original', new Date())).toThrow();
  });
});

describe('images', () => {
  it('rejects decompression bombs before decoding', async () => {
    const huge = await sharp({
      create: { width: 4000, height: 4000, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    await expect(inspectImage(huge, 1_000_000)).rejects.toBeInstanceOf(ImageRejectedError);
    await expect(
      inspectImage(Buffer.from('\x89PNG\r\n\x1a\nbroken'), 1_000_000),
    ).rejects.toBeInstanceOf(ImageRejectedError);
  });

  it('makes WebP thumbnail + preview without metadata', async () => {
    const withExif = await sharp(await png())
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'secret camera' } } })
      .toBuffer();
    const info = await inspectImage(withExif, 1_000_000);
    expect(info).toMatchObject({ width: 40, height: 20 });
    const derived = await makeDerivatives(withExif, MediaTypes.jpeg, 1_000_000);
    expect(derived.map((d) => d.variant)).toEqual(['thumb_256', 'preview_1024']);
    for (const d of derived) {
      const meta = await sharp(d.buffer).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      expect(d.width).toBe(40); // never enlarged
    }
    expect(await makeDerivatives(Buffer.from('%PDF-1.4'), MediaTypes.pdf, 1)).toEqual([]);
  });

  it('rasterises sanitized SVG', async () => {
    const { svg } = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><rect width="300" height="100" fill="#09c"/></svg>',
    );
    const [thumb] = await makeDerivatives(Buffer.from(svg), MediaTypes.svg, 10_000_000);
    expect(thumb?.width).toBe(256);
  });
});

describe('scanner port', () => {
  it('test scanner flags the EICAR string', async () => {
    const scanner = new EicarTestScanner();
    expect(
      (
        await scanner.scan(
          Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'),
        )
      ).verdict,
    ).toBe('infected');
    expect((await scanner.scan(Buffer.from('hello'))).verdict).toBe('clean');
  });
});
