import { Module } from '@nestjs/common';

import { ArtifactsModule } from '../artifacts/artifacts.module.js';
import { DesignsModule } from '../designs/designs.module.js';

import { DesignOperationsController, OperationsController } from './operations.controller.js';
import { OperationsService } from './operations.service.js';

/**
 * Design operation router (SS-06, I14): owns `design_operations`. The only path that changes a
 * working copy's state (through `WorkingCopyService.writeOperationState`). Docs:
 * docs/architecture/operations.md.
 */
@Module({
  imports: [DesignsModule, ArtifactsModule],
  controllers: [DesignOperationsController, OperationsController],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
