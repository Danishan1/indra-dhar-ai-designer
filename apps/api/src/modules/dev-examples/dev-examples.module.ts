import { Module } from '@nestjs/common';

import { DevExamplesController } from './dev-examples.controller.js';

@Module({ controllers: [DevExamplesController] })
export class DevExamplesModule {}
