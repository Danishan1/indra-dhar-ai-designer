import { FakeProvider } from '@ai-designer/ai';
import { describe, expect, it } from 'vitest';

import { fakeResponders } from './fake-responders.js';
import {
  designToSketchPrompt,
  fabricDesignPrompt,
  photoToSketchPrompt,
  suggestFromFabric,
} from './starts.js';

const image = { mediaType: 'image/png', data: new Uint8Array([1]) };

describe('starting points (ADR-066)', () => {
  it('a photo becomes a black-and-white line sketch of the garment only', () => {
    const p = photoToSketchPrompt({ garmentHint: 'dress', notes: 'back zip', views: 2 });
    expect(p).toContain('several views of the same outfit');
    expect(p).toContain('The user says it is: dress.');
    expect(p).toContain('Ignore the person, pose, background, lighting, colours and print');
    expect(p).toContain('BLACK LINES ONLY');
    expect(p).toContain('NO person');
    expect(p).toContain('draw each garment separately');
  });

  it('suggests garments for the chosen wearer, or decides the wearer', async () => {
    const provider = new FakeProvider(fakeResponders);
    const chosen = await suggestFromFabric({ images: [image], audience: 'men' }, { provider });
    expect(chosen.bestFor).toBeNull();
    expect(chosen.suggestions.length).toBeGreaterThanOrEqual(3);
    expect(chosen.suggestions.every((s) => s.audience === 'men')).toBe(true);
    expect(provider.calls[0]!.prompt).toContain('for men');

    const auto = await suggestFromFabric({ images: [image], audience: null }, { provider });
    expect(auto.bestFor?.audience).toBe('girls');
    expect(auto.fabric.colors).toContain('navy');
    expect(auto.suggestions.map((s) => s.garmentType)).toContain('dress');
    expect(provider.calls[1]!.prompt).toContain('First decide who this fabric suits best');
  });

  it('draws the chosen design in the fabric, then its line sketch', async () => {
    const provider = new FakeProvider(fakeResponders);
    const { fabric, suggestions } = await suggestFromFabric(
      { images: [image], audience: 'girls' },
      { provider },
    );
    const s = suggestions[0]!;
    const design = fabricDesignPrompt(s, fabric);
    expect(design).toContain('tiered sundress');
    expect(design).toContain('a girl model');
    expect(design).toContain('navy, white');
    expect(design).toContain('square neckline');
    const sketch = designToSketchPrompt(s);
    expect(sketch).toContain('Details to keep: square neckline');
    expect(sketch).toContain('BLACK LINES ONLY');
  });
});
