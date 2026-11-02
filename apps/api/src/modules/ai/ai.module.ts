import { Module } from '@nestjs/common';

import { AiUsageService } from './ai-usage.service.js';
import { AiController } from './ai.controller.js';

/** AI provider status and usage preflight (ADR-056). Owns `ai_usage_records`. */
@Module({
  controllers: [AiController],
  providers: [AiUsageService],
  exports: [AiUsageService],
})
export class AiModule {}
