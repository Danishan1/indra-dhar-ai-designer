import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { buildPinoHttpOptions } from './logger-options.js';
import { AppConfig } from '../config/app-config.js';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({ pinoHttp: buildPinoHttpOptions(config) }),
    }),
  ],
})
export class LoggingModule {}
