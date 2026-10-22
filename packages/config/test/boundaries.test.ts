import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import { base, packageBoundaries, purePackageBoundaries } from '../eslint/index.js';

async function lint(code: string, configs: unknown[]): Promise<string[]> {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [...base, ...(configs as never[])],
  });
  const [result] = await eslint.lintText(code, { filePath: 'packages/example/src/index.ts' });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'fatal');
}

describe('dependency boundary rules (01-architecture.md §3)', () => {
  it('rejects a package importing an app', async () => {
    const rules = await lint(
      "import { x } from '@ai-designer/api';\nexport const y = x;\n",
      packageBoundaries,
    );
    expect(rules).toContain('no-restricted-imports');
  });

  it('rejects a package importing an app by relative path', async () => {
    const rules = await lint(
      "import { x } from '../../../apps/web/src/lib/app-info.js';\nexport const y = x;\n",
      packageBoundaries,
    );
    expect(rules).toContain('no-restricted-imports');
  });

  it('rejects framework imports in pure packages', async () => {
    const rules = await lint(
      "import { Injectable } from '@nestjs/common';\nexport const y = Injectable;\n",
      purePackageBoundaries,
    );
    expect(rules).toContain('no-restricted-imports');
  });

  it('allows ordinary imports', async () => {
    const rules = await lint(
      "import { z } from 'zod';\nexport const y = z;\n",
      purePackageBoundaries,
    );
    expect(rules).not.toContain('no-restricted-imports');
  });
});
