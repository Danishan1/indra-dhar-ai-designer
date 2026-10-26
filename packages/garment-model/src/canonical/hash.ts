import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

import type { GarmentDesignState } from '../schema/design-state.js';

import { canonicalize, canonicalizeSemantic } from './canonicalize.js';

export const HASH_PREFIX = 'sha256:';

/** `sha256:<hex>` of a string; pure JS, so Node and browsers always agree (ADR-003). */
export function sha256Hex(text: string): string {
  return `${HASH_PREFIX}${bytesToHex(sha256(utf8ToBytes(text)))}`;
}

/** Identity of the whole snapshot, including editor flags and metadata. */
export function contentHash(state: GarmentDesignState): string {
  return sha256Hex(canonicalize(state));
}

/** Identity of the garment itself: unchanged by toggling visibility, renaming metadata or migrating. */
export function semanticHash(state: GarmentDesignState): string {
  return sha256Hex(canonicalizeSemantic(state));
}
