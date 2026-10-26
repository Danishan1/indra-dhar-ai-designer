import { GarmentModelError } from '../errors.js';

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export function parseVersion(version: string): SemVer {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m)
    throw new GarmentModelError(
      'UNSUPPORTED_VERSION',
      `"${version}" is not a schema version like 1.0.0`,
    );
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  return x.major - y.major || x.minor - y.minor || x.patch - y.patch;
}
