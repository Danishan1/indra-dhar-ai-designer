import { livenessSchema, readinessSchema } from '@ai-designer/contracts';
import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../authz/decorators.js';
import { AppConfig } from '../config/app-config.js';
import { Endpoint } from '../validation/endpoint.js';

import { HealthService, type ReadinessReport } from './health.service.js';

export interface LivenessResponse {
  status: 'ok';
  service: 'api';
  version: string;
  time: string;
}

@Controller('health')
@Public()
export class HealthController {
  constructor(
    private readonly config: AppConfig,
    private readonly health: HealthService,
  ) {}

  /** Liveness: the process is up. Public. */
  @Get()
  @Endpoint({ summary: 'Liveness probe', tags: ['health'], response: livenessSchema })
  liveness(): LivenessResponse {
    return {
      status: 'ok',
      service: 'api',
      version: this.config.env.APP_VERSION,
      time: new Date().toISOString(),
    };
  }

  /** Readiness: dependencies reachable. 503 when degraded. Public. */
  @Get('ready')
  @Endpoint({
    summary: 'Readiness probe (503 when a dependency is down)',
    tags: ['health'],
    response: readinessSchema,
    errors: ['DEPENDENCY_UNAVAILABLE'],
  })
  async readiness(@Res({ passthrough: true }) res: Response): Promise<ReadinessReport> {
    const report = await this.health.readiness();
    if (report.status !== 'ok') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
