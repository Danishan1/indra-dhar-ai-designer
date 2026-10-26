import { Global, Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module.js';

import { ProjectLifecycleRegistry } from './dependents-registry.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

/**
 * Project lifecycle (SS-02, I10): owns the `projects` table. Global so later modules (designs I12,
 * reviews I28, exports I42) can register dependents and completion checks.
 */
@Global()
@Module({
  imports: [IdentityModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectLifecycleRegistry],
  exports: [ProjectsService, ProjectLifecycleRegistry],
})
export class ProjectsModule {}
