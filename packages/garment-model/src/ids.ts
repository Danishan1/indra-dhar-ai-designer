/** Stable ids inside a garment snapshot: `cmp_`, `rel_`, `cst_`, `bnd_` + 12 random base-36 characters. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const LENGTH = 12;

export type RandomBytes = (length: number) => Uint8Array;

const defaultRandomBytes: RandomBytes = (length) => {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

export const IdPrefixes = {
  component: 'cmp',
  relationship: 'rel',
  constraint: 'cst',
  binding: 'bnd',
} as const;
export type IdKind = keyof typeof IdPrefixes;

export const ID_PATTERN = /^(cmp|rel|cst|bnd)_[a-z0-9]{8,32}$/;

/** Unbiased: bytes ≥ 252 (the largest multiple of 36 below 256) are rejected. */
export function createId(kind: IdKind, randomBytes: RandomBytes = defaultRandomBytes): string {
  let out = '';
  while (out.length < LENGTH) {
    for (const b of randomBytes(LENGTH * 2)) {
      if (b >= 252) continue;
      out += ALPHABET[b % ALPHABET.length];
      if (out.length === LENGTH) break;
    }
  }
  return `${IdPrefixes[kind]}_${out}`;
}

export const createComponentId = (r?: RandomBytes) => createId('component', r);
export const createRelationshipId = (r?: RandomBytes) => createId('relationship', r);
export const createConstraintId = (r?: RandomBytes) => createId('constraint', r);
export const createBindingId = (r?: RandomBytes) => createId('binding', r);

/** Deterministic generator for tests and fixtures: `cmp_000000000001`, `cmp_000000000002`, … */
export function sequentialRandomBytes(): RandomBytes {
  let n = 0;
  return (length) => {
    const bytes = new Uint8Array(length);
    // Encode the counter in base 36 into the leading bytes, zero elsewhere (maps to 'a').
    n += 1;
    const digits = n.toString(36).padStart(LENGTH, '0').padEnd(length, '0');
    for (let i = 0; i < length; i++) {
      const ch = digits.charCodeAt(i);
      bytes[i] = ch >= 97 ? ch - 97 : ch - 48 + 26;
    }
    return bytes;
  };
}
