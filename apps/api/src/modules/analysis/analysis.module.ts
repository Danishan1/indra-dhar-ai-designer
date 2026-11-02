import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module.js';
import { ArtifactsModule } from '../artifacts/artifacts.module.js';
import { DesignsModule } from '../designs/designs.module.js';

import { AnalysesController, ProjectAnalysesController } from './analysis.controller.js';
import { AnalysisService } from './analysis.service.js';

/**
 * Component 1 — AI design analyzer (ADR-056): owns `design_analyses`. The worker runs the
 * analysis (`design.analysis` job); creating the design from a reviewed result happens here.
 * Docs: docs/architecture/ai-studio.md.
 */
@Module({
  imports: [AiModule, DesignsModule, ArtifactsModule],
  controllers: [ProjectAnalysesController, AnalysesController],
  providers: [AnalysisService],
  exports: [AnalysisService],
})
export class AnalysisModule {}
