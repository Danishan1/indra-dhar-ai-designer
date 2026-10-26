import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module.js';

import { DesignCommitHooks } from './commit-hooks.js';
import { CompareService } from './compare.service.js';
import {
  DesignsController,
  ProjectDesignsController,
  RevisionsController,
} from './designs.controller.js';
import { DesignsService } from './designs.service.js';
import { DesignReferencesService } from './references.service.js';
import { RevisionService } from './revision.service.js';
import { WorkingCopyService } from './working-copy.service.js';

/**
 * Designs, working copies and immutable revisions (SS-03 persistence, I12). Owns the `designs`,
 * `working_copies` and `design_revisions` tables. Docs: docs/architecture/designs.md.
 */
@Module({
  imports: [IdentityModule],
  controllers: [ProjectDesignsController, DesignsController, RevisionsController],
  providers: [
    DesignsService,
    WorkingCopyService,
    RevisionService,
    CompareService,
    DesignReferencesService,
    DesignCommitHooks,
  ],
  exports: [
    DesignsService,
    WorkingCopyService,
    RevisionService,
    DesignReferencesService,
    DesignCommitHooks,
  ],
})
export class DesignsModule {}
