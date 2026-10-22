import { type DynamicModule, Module } from '@nestjs/common';

import { type AppConfig } from './platform/config/app-config.js';
import { AppConfigModule } from './platform/config/config.module.js';
import { HealthModule } from './platform/health/health.module.js';
import { LoggingModule } from './platform/logging/logging.module.js';
import { PrismaModule } from './platform/prisma/prisma.module.js';
import { QueueModule } from './platform/queue/queue.module.js';
import { RedisModule } from './platform/redis/redis.module.js';
import { StorageModule } from './platform/storage/storage.module.js';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(config),
        LoggingModule,
        PrismaModule,
        RedisModule,
        StorageModule,
        QueueModule,
        HealthModule,
      ],
    };
  }
}
