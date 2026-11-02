import { Module } from '@nestjs/common';

import { AiCatalogService } from './ai-catalog.service.js';
import { AiUsageService } from './ai-usage.service.js';
import { AiController } from './ai.controller.js';

/** AI provider status and usage preflight (ADR-056). Owns `ai_usage_records`, `ai_provider_connections` and `ai_settings` (ADR-057). */
@Module({
  controllers: [AiController],
  providers: [AiCatalogService, AiUsageService],
  exports: [AiCatalogService, AiUsageService],
})
export class AiModule {}
