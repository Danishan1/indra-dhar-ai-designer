import { Injectable } from '@nestjs/common';

/** Answers "is this asset used by something that must not lose it?" (an immutable revision, a released tech pack…). */
export type AssetReferenceCheck = (asset: {
  id: string;
  organizationId: string;
}) => Promise<string | null>;

/**
 * Modules that keep immutable references to assets register a check here (I12 revisions, I13
 * artifacts, I42 exports…). Deleting an asset is refused while any check reports a reference
 * (AST-006, FR-RV-149).
 */
@Injectable()
export class AssetReferenceRegistry {
  private readonly checks = new Map<string, AssetReferenceCheck>();

  register(name: string, check: AssetReferenceCheck): void {
    this.checks.set(name, check);
  }

  unregister(name: string): void {
    this.checks.delete(name);
  }

  /** Names/descriptions of everything that references the asset (empty = free to delete). */
  async referencesOf(asset: { id: string; organizationId: string }): Promise<string[]> {
    const found: string[] = [];
    for (const [name, check] of this.checks) {
      const ref = await check(asset);
      if (ref) found.push(`${name}: ${ref}`);
    }
    return found;
  }
}
