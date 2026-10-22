import { type DynamicModule, Global, Module } from '@nestjs/common';

import { AppConfig } from './app-config.js';

@Global()
@Module({})
export class AppConfigModule {
  /** Registers a pre-validated AppConfig (validation happens in main.ts before Nest boots). */
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppConfigModule,
      providers: [{ provide: AppConfig, useValue: config }],
      exports: [AppConfig],
    };
  }
}
