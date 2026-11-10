import { Module } from '@nestjs/common';

import { SizeChartsController } from './size-charts.controller.js';
import { SizeChartsService } from './size-charts.service.js';

/**
 * Organization size charts (ADR-067): owns `size_charts`. Designs copy the chart they use into
 * their pattern spec, so editing or deleting a chart never changes a design or a revision.
 */
@Module({
  controllers: [SizeChartsController],
  providers: [SizeChartsService],
  exports: [SizeChartsService],
})
export class SizeChartsModule {}
