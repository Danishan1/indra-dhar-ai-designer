import { Module } from '@nestjs/common';

import { DesignsModule } from '../designs/designs.module.js';

import { DesignValidationController, ValidationRunsController } from './validation.controller.js';
import { ValidationService } from './validation.service.js';

/**
 * Design-structure validation (SS-12, I20): owns `constraint_sets`, `validation_runs` and
 * `validation_findings`. Rules live in `@ai-designer/garment-model` (pure, shared with the web).
 * Docs: docs/architecture/validation.md.
 */
@Module({
  imports: [DesignsModule],
  controllers: [DesignValidationController, ValidationRunsController],
  providers: [ValidationService],
  exports: [ValidationService],
})
export class ValidationModule {}
