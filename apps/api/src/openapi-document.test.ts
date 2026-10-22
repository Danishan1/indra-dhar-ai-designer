import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildPublicOpenApiDocument,
  OPENAPI_SNAPSHOT_PATH,
  serializeOpenApi,
} from './openapi-document.js';

describe('OpenAPI contract', () => {
  const doc = buildPublicOpenApiDocument();

  it('matches the committed snapshot (run `pnpm --filter @ai-designer/api openapi:generate` after API changes)', () => {
    expect(serializeOpenApi(doc)).toBe(readFileSync(OPENAPI_SNAPSHOT_PATH, 'utf8'));
  });

  it('documents every public route and excludes dev routes', () => {
    const paths = doc.paths as Record<string, Record<string, Record<string, unknown>>>;
    expect(Object.keys(paths)).toContain('/v1/health');
    expect(Object.keys(paths).some((p) => p.includes('_dev') || p.includes('openapi'))).toBe(false);
    for (const ops of Object.values(paths)) {
      for (const op of Object.values(ops)) expect(op['x-undocumented']).toBeUndefined();
    }
  });
});
