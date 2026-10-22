import { Global, Module } from '@nestjs/common';

import { OBJECT_STORAGE, S3ObjectStorage } from './object-storage.js';
import { AppConfig } from '../config/app-config.js';

@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => new S3ObjectStorage(config.storage),
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
