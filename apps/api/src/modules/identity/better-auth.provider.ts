import type { Provider } from '@nestjs/common';

import { AppConfig } from '../../platform/config/app-config.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';

import { createBetterAuth } from './better-auth.js';
import { IdentityHooksService } from './identity-hooks.service.js';

export const BETTER_AUTH = Symbol('BETTER_AUTH');

export const betterAuthProvider: Provider = {
  provide: BETTER_AUTH,
  inject: [PrismaService, AppConfig, IdentityHooksService],
  useFactory: (prisma: PrismaService, config: AppConfig, hooks: IdentityHooksService) =>
    createBetterAuth(prisma, config, hooks),
};
