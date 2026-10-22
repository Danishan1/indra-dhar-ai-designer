import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * argon2id with the OWASP-recommended baseline (19 MiB memory, 2 iterations, 1 lane)
 * (FR-SEC-016). Parameters are embedded in each PHC hash string, so they can be raised later;
 * existing hashes keep verifying. Plain passwords never leave this module or reach logs.
 */
export const ARGON2_PARAMS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_PARAMS);
}

export async function verifyPassword({
  hash: stored,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  if (!stored.startsWith('$argon2')) return false;
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/** True when a stored hash uses weaker parameters than the current baseline (rehash on login). */
export function needsRehash(stored: string): boolean {
  const m = /^\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(stored);
  if (!m) return true;
  return Number(m[1]) < ARGON2_PARAMS.memoryCost || Number(m[2]) < ARGON2_PARAMS.timeCost;
}
