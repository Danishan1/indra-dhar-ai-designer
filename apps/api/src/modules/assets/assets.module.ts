import { Global, Module } from '@nestjs/common';

import { AssetsController } from './assets.controller.js';
import { AssetsService } from './assets.service.js';
import { AssetReferenceRegistry } from './reference-registry.js';

/**
 * Asset & storage (SS-11, I09): owns the `assets` table and object keys. Global so later modules
 * (projects, revisions, artifacts, exports) can register references and look assets up.
 */
@Global()
@Module({
  controllers: [AssetsController],
  providers: [AssetsService, AssetReferenceRegistry],
  exports: [AssetsService, AssetReferenceRegistry],
})
export class AssetsModule {}
