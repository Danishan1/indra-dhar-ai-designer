import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { AccountService } from './account.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { BETTER_AUTH, betterAuthProvider } from './better-auth.provider.js';
import { IdentityHooksService } from './identity-hooks.service.js';
import { IdentityMailService } from './identity-mail.service.js';
import { MeController } from './me.controller.js';
import { SessionMiddleware } from './session.middleware.js';
import { VerificationTokenService } from './verification-token.service.js';

/**
 * Identity & access (SS-01): accounts, credentials, sessions, verification (I05). Owns the users,
 * sessions, identity_credentials and verification_tokens tables. Organizations arrive in I06.
 */
@Module({
  controllers: [AuthController, MeController],
  providers: [
    AccountService,
    VerificationTokenService,
    IdentityMailService,
    IdentityHooksService,
    betterAuthProvider,
    AuthService,
    SessionMiddleware,
  ],
  exports: [AccountService, BETTER_AUTH],
})
export class IdentityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SessionMiddleware).forRoutes('*path');
  }
}
