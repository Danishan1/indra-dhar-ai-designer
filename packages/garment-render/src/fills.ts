/**
 * Fill resolution: fabric texture (via the caller's resolver) > pattern (stripe/check) > colour,
 * each looked up on the component, then its parents. On-screen fabric never guarantees physical
 * colour (FR-RV-085).
 */
import type { DesignComponent, GarmentDesignState } from '@ai-designer/garment-model';

import { ParamReader } from './params.js';
import { NEUTRAL_FILL } from './styles.js';
import type { PatternDef, RenderOptions } from './types.js';

/** FNV-1a, for short deterministic pattern ids. */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function darken(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (shift: number) => Math.round(((n >> shift) & 255) * (1 - k));
  return `#${[16, 8, 0].map((s) => c(s).toString(16).padStart(2, '0')).join('')}`;
}

export class FillResolver {
  private readonly patterns = new Map<string, PatternDef>();
  private readonly byId: Map<string, DesignComponent>;

  constructor(
    state: GarmentDesignState,
    private readonly options: RenderOptions,
  ) {
    this.byId = new Map(state.components.map((c) => [c.componentId, c]));
  }

  /** The component and its ancestors, nearest first. */
  private chain(c: DesignComponent): DesignComponent[] {
    const out: DesignComponent[] = [];
    let cur: DesignComponent | undefined = c;
    while (cur && out.length < 20) {
      out.push(cur);
      cur = cur.parentComponentId ? this.byId.get(cur.parentComponentId) : undefined;
    }
    return out;
  }

  fillFor(c: DesignComponent): string {
    const chain = this.chain(c).map((x) => new ParamReader(x));
    const color = chain.map((r) => r.color()).find((x) => x !== null) ?? NEUTRAL_FILL;
    const fabricRef = chain.map((r) => r.reference('material.fabric_ref')).find((x) => x !== null);
    const texture = fabricRef && this.options.fabric ? this.options.fabric(fabricRef) : null;
    if (texture) {
      const id = `tex-${shortHash(`${texture.href}|${texture.sizeMm}|${texture.rotationDeg ?? 0}`)}`;
      this.patterns.set(id, {
        id,
        kind: 'texture',
        href: texture.href,
        base: color,
        sizeMm: texture.sizeMm,
        rotationDeg: texture.rotationDeg ?? 0,
      });
      return `url(#${id})`;
    }
    const pattern = chain.map((r) => r.plainEnum('appearance.pattern')).find((x) => x !== null);
    if (pattern === 'stripe' || pattern === 'check') {
      const id = `${pattern}-${color.slice(1)}`;
      this.patterns.set(id, {
        id,
        kind: pattern,
        base: color,
        color: darken(color === NEUTRAL_FILL ? '#9ca3af' : color, 0.35),
        sizeMm: pattern === 'stripe' ? 12 : 16,
      });
      return `url(#${id})`;
    }
    return color;
  }

  definitions(): PatternDef[] {
    return [...this.patterns.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
}
