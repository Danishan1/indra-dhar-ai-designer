import { Module } from '@nestjs/common';

import { DesignsModule } from '../designs/designs.module.js';

import { ArtifactRevisionsController, ArtifactsController } from './artifacts.controller.js';
import { ArtifactsService } from './artifacts.service.js';
import { PlatformLibraryService } from './platform-library.service.js';

/**
 * Artifact registry (SS-05, I13): owns `artifacts` and `artifact_revisions`; syncs the built-in
 * library at start. Docs: docs/architecture/artifacts.md.
 */
@Module({
  imports: [DesignsModule],
  controllers: [ArtifactsController, ArtifactRevisionsController],
  providers: [ArtifactsService, PlatformLibraryService],
  exports: [ArtifactsService],
})
export class ArtifactsModule {}
