import { formatDisplayId } from '@ai-designer/contracts';
import { v7 as uuidv7 } from 'uuid';

import type { DbClient } from '../client.js';

/** New primary key (UUIDv7, time-ordered; ADR-001). */
export function newId(): string {
  return uuidv7();
}

export const PLATFORM_SCOPE = 'platform';

/**
 * Allocates the next number for (scope, prefix) atomically — a single INSERT … ON CONFLICT DO
 * UPDATE … RETURNING, safe under concurrency. Gaps are possible if the surrounding transaction
 * rolls back (display ids are gap-tolerant by design).
 */
export async function nextSequenceValue(
  db: DbClient,
  scopeKey: string,
  prefix: string,
): Promise<bigint> {
  const rows = await db.$queryRaw<{ next_value: bigint }[]>`
    INSERT INTO id_sequences (scope_key, prefix, next_value, updated_at)
    VALUES (${scopeKey}, ${prefix}, 1, now())
    ON CONFLICT (scope_key, prefix)
    DO UPDATE SET next_value = id_sequences.next_value + 1, updated_at = now()
    RETURNING next_value`;
  const value = rows[0]?.next_value;
  if (value === undefined) throw new Error('id sequence allocation failed');
  return value;
}

/** Next human-readable display id, e.g. `PRJ-000123`, scoped per organization (or platform). */
export async function nextDisplayId(
  db: DbClient,
  organizationId: string | null,
  prefix: string,
): Promise<string> {
  return formatDisplayId(
    prefix,
    await nextSequenceValue(db, organizationId ?? PLATFORM_SCOPE, prefix),
  );
}
