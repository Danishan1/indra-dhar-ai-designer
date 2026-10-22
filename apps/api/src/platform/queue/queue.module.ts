import { Global, Module } from '@nestjs/common';

import { SystemQueueService } from './system-queue.service.js';

@Global()
@Module({ providers: [SystemQueueService], exports: [SystemQueueService] })
export class QueueModule {}
