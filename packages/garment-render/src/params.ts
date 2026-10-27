/**
 * Property → geometry parameter mapping. A property without a value (missing, not applicable…) is
 * drawn with the template default and reported as a placeholder (FR-RV-004) — the renderer never
 * writes anything back into the design.
 */
import {
  convertLength,
  type DesignComponent,
  isLengthUnit,
  type PropertyValue,
} from '@ai-designer/garment-model';

export class ParamReader {
  readonly placeholders: string[] = [];

  constructor(private readonly component: DesignComponent | undefined) {}

  private raw(key: string): PropertyValue | undefined {
    return this.component?.properties[key];
  }

  private flag(key: string) {
    if (this.component && !this.placeholders.includes(key)) this.placeholders.push(key);
  }

  /** A length in mm, clamped to a plausible drawing range. */
  length(key: string, fallback: number, min: number, max: number): number {
    const pv = this.raw(key);
    const v = pv?.value;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      this.flag(key);
      return fallback;
    }
    const mm = pv?.unit && isLengthUnit(pv.unit) ? convertLength(v, pv.unit, 'mm') : v;
    return Math.min(max, Math.max(min, mm));
  }

  count(key: string, fallback: number, min: number, max: number): number {
    const v = this.raw(key)?.value;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      this.flag(key);
      return fallback;
    }
    return Math.round(Math.min(max, Math.max(min, v)));
  }

  /** An enum value the renderer knows; anything else (missing, extension value) uses the default. */
  choice<T extends string>(key: string, supported: readonly T[], fallback: T): T {
    const v = this.raw(key)?.value;
    if (typeof v === 'string' && (supported as readonly string[]).includes(v)) return v as T;
    this.flag(key);
    return fallback;
  }

  /** Colour or null (an absent colour is a display matter, never a placeholder). */
  color(key = 'appearance.color'): string | null {
    const v = this.raw(key)?.value;
    return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
  }

  plainEnum(key: string): string | null {
    const v = this.raw(key)?.value;
    return typeof v === 'string' ? v : null;
  }

  reference(
    key: string,
  ): { entityType: string; entityId: string; revisionId: string | null } | null {
    const v = this.raw(key)?.value as
      { entityType?: unknown; entityId?: unknown; revisionId?: unknown } | null | undefined;
    if (!v || typeof v !== 'object' || typeof v.entityId !== 'string') return null;
    return {
      entityType: typeof v.entityType === 'string' ? v.entityType : 'artifact_revision',
      entityId: v.entityId,
      revisionId: typeof v.revisionId === 'string' ? v.revisionId : null,
    };
  }
}
