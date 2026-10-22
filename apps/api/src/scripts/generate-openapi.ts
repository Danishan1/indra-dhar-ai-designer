/** Writes docs/api/openapi.json. Usage: pnpm --filter @ai-designer/api openapi:generate */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  buildPublicOpenApiDocument,
  OPENAPI_SNAPSHOT_PATH,
  serializeOpenApi,
} from '../openapi-document.js';

mkdirSync(dirname(OPENAPI_SNAPSHOT_PATH), { recursive: true });
writeFileSync(OPENAPI_SNAPSHOT_PATH, serializeOpenApi(buildPublicOpenApiDocument()));
console.warn(`[openapi] wrote ${OPENAPI_SNAPSHOT_PATH}`);
