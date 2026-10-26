import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const FORBIDDEN =
  /^(react|react-dom|next|@nestjs\/|@prisma\/|prisma|bullmq|ioredis|openai|@anthropic-ai\/|@google\/|@aws-sdk\/|pg$|sharp|jsdom$)/;
const SRC = import.meta.dirname;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('dependency boundary (AC8)', () => {
  it('declares only zod and @noble/hashes at runtime', () => {
    const pkg = JSON.parse(readFileSync(join(SRC, '../package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['@noble/hashes', 'zod']);
  });

  it('no source file imports a framework, ORM, queue or AI provider', () => {
    const offenders: string[] = [];
    for (const f of files(SRC).filter((x) => !x.endsWith('.test.ts'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/from '([^']+)'/g)) {
        const spec = m[1] as string;
        if (!spec.startsWith('.') && (FORBIDDEN.test(spec) || spec.startsWith('node:')))
          offenders.push(`${f}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
