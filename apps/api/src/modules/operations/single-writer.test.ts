import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '../..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory()
      ? files(p)
      : /\.ts$/.test(n) && !/\.test\.ts$/.test(n)
        ? [p]
        : [];
  });
}

/** AC1 of I14: the working copy's state changes only through design operations (and commit/restore). */
describe('working copy single writer', () => {
  it('only the operations service calls writeOperationState', () => {
    const callers = files(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes('writeOperationState('))
      .map((f) => relative(SRC, f).replaceAll('\\', '/'))
      .sort();
    expect(callers).toEqual([
      'modules/designs/working-copy.service.ts',
      'modules/operations/operations.service.ts',
    ]);
  });

  it('nothing outside the working-copy service writes working_copies', () => {
    const writers = files(SRC)
      .filter((f) =>
        /\bworkingCopy\.(update|updateMany|create|upsert)\(/.test(readFileSync(f, 'utf8')),
      )
      .map((f) => relative(SRC, f).replaceAll('\\', '/'));
    expect(writers).toEqual(['modules/designs/working-copy.service.ts']);
  });
});
