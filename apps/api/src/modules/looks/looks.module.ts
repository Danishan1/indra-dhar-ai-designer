import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module.js';
import { DesignsModule } from '../designs/designs.module.js';

import { DesignLooksController, LooksController } from './looks.controller.js';
import { LooksService } from './looks.service.js';

/**
 * Look previews (ADR-064): owns `design_looks`. The worker draws the garment from the patterns of a
 * committed revision (`look.generate`). Docs: docs/architecture/ai-studio.md.
 */
@Module({
  imports: [AiModule, DesignsModule],
  controllers: [DesignLooksController, LooksController],
  providers: [LooksService],
  exports: [LooksService],
})
export class LooksModule {}
