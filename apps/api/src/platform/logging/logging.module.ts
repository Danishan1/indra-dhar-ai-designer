import { createLogDestination } from '@ai-designer/logger';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { AppConfig } from '../config/app-config.js';

import { buildPinoHttpOptions } from './logger-options.js';

/**
 * Request-scoped structured logging (pino). Output: console (JSON or pretty) and, when LOG_TO_FILE
 * is on (default in development), rotating files logs/api/api.<date>.<n>.log plus
 * logs/api/api-error.<date>.<n>.log for errors only. logs/ is git-ignored.
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: async (config: AppConfig) => ({
        pinoHttp: [
          buildPinoHttpOptions(config),
          await createLogDestination(config.logSettings, 'api'),
        ],
      }),
    }),
  ],
})
export class LoggingModule {}
