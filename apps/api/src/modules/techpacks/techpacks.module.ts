import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module.js';
import { DesignsModule } from '../designs/designs.module.js';

import { DesignTechPacksController, TechPacksController } from './techpacks.controller.js';
import { TechPacksService } from './techpacks.service.js';

/**
 * Component 3 — tech pack generator (ADR-056): owns `tech_packs`. The worker generates the
 * document and PDF (`techpack.generate`). Docs: docs/architecture/ai-studio.md.
 */
@Module({
  imports: [AiModule, DesignsModule],
  controllers: [DesignTechPacksController, TechPacksController],
  providers: [TechPacksService],
  exports: [TechPacksService],
})
export class TechPacksModule {}
