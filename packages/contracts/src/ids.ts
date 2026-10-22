/**
 * Human-readable display IDs (ADR-001). Primary keys are UUIDv7; display IDs are unique per
 * organization (or platform) and prefix, never used as foreign keys.
 */
export const DisplayIdPrefixes = {
  organization: 'ORG',
  project: 'PRJ',
  design: 'DSN',
  component: 'CMP',
  asset: 'AST',
  operation: 'OPR',
  job: 'JOB',
  specification: 'TPS',
  invoice: 'INV',
  // Artifact categories (I13)
  sleeve: 'SLV',
  collar: 'COL',
  cuff: 'CUF',
  pocket: 'PKT',
  placket: 'PLK',
  neckline: 'NCK',
  fabric: 'FAB',
  lace: 'LAC',
  trim: 'TRM',
  embroidery: 'EMB',
  button: 'BTN',
  artwork: 'ART',
} as const;

export type DisplayIdPrefix = (typeof DisplayIdPrefixes)[keyof typeof DisplayIdPrefixes];

const PAD: Partial<Record<string, number>> = {
  SLV: 4,
  COL: 4,
  CUF: 4,
  PKT: 4,
  PLK: 4,
  NCK: 4,
  FAB: 4,
  LAC: 4,
  TRM: 4,
  EMB: 4,
  BTN: 4,
  ART: 4,
};

/** `formatDisplayId('PRJ', 123)` → `PRJ-000123`; artifact prefixes use 4 digits (`SLV-0007`). */
export function formatDisplayId(prefix: string, value: number | bigint): string {
  const width = PAD[prefix] ?? 6;
  return `${prefix}-${value.toString().padStart(width, '0')}`;
}

/** Revision display id: `formatRevisionId('DSN-000456', 3)` → `DSN-000456-R003`. */
export function formatRevisionId(parentDisplayId: string, revision: number): string {
  return `${parentDisplayId}-R${revision.toString().padStart(3, '0')}`;
}

const DISPLAY_ID_RE = /^([A-Z]{3})-(\d{4,})(?:-R(\d{3,}))?$/;

export function parseDisplayId(
  value: string,
): { prefix: string; number: number; revision?: number } | null {
  const m = DISPLAY_ID_RE.exec(value);
  if (!m) return null;
  return { prefix: m[1] ?? '', number: Number(m[2]), ...(m[3] ? { revision: Number(m[3]) } : {}) };
}
