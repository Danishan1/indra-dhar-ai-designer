import {
  mfaStatusSchema,
  recoveryCodesResponseSchema,
  revokeOthersResponseSchema,
  sessionIdParamsSchema,
  sessionsResponseSchema,
  totpConfirmRequestSchema,
  totpDisableRequestSchema,
  totpSetupResponseSchema,
} from '@ai-designer/contracts';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';

import type { RequestAuth } from '../../platform/auth/request-auth.js';
import { AuthenticatedOnly } from '../../platform/authz/decorators.js';
import { AppError } from '../../platform/errors/app-error.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { MfaService } from './mfa/mfa.service.js';
import { SessionsService } from './sessions.service.js';

function authOf(req: Request): RequestAuth {
  if (!req.auth || req.auth.pending) throw new AppError('UNAUTHENTICATED', 'Sign in to continue');
  return req.auth;
}

/** The signed-in user's own security settings: second factor and sessions (I08). */
@Controller('me')
@AuthenticatedOnly()
export class SecurityController {
  constructor(
    private readonly mfa: MfaService,
    private readonly sessions: SessionsService,
  ) {}

  @Get('mfa')
  @Endpoint({
    summary: 'Two-step verification status',
    tags: ['security'],
    response: mfaStatusSchema,
  })
  status(@Req() req: Request) {
    return this.mfa.status(authOf(req));
  }

  @Post('mfa/totp/setup')
  @HttpCode(200)
  @Endpoint({
    summary: 'Start authenticator-app setup (returns the secret and otpauth URI once)',
    tags: ['security'],
    response: totpSetupResponseSchema,
    successStatus: 200,
    errors: ['CONFLICT'],
  })
  setup(@Req() req: Request) {
    return this.mfa.setup(authOf(req).userId);
  }

  @Post('mfa/totp/confirm')
  @HttpCode(200)
  @Endpoint({
    summary: 'Confirm setup with a code; returns recovery codes once and signs out other sessions',
    tags: ['security'],
    body: totpConfirmRequestSchema,
    response: recoveryCodesResponseSchema,
    successStatus: 200,
    errors: ['MFA_CODE_INVALID', 'CONFLICT', 'RATE_LIMITED'],
  })
  async confirm(@Req() req: Request, @Body() body: z.output<typeof totpConfirmRequestSchema>) {
    return { codes: await this.mfa.confirm(authOf(req), body.code) };
  }

  @Post('mfa/totp/disable')
  @HttpCode(204)
  @Endpoint({
    summary: 'Turn off two-step verification (password + current code)',
    tags: ['security'],
    body: totpDisableRequestSchema,
    successStatus: 204,
    errors: ['MFA_CODE_INVALID', 'VALIDATION_FAILED', 'RATE_LIMITED'],
  })
  async disable(@Req() req: Request, @Body() body: z.output<typeof totpDisableRequestSchema>) {
    await this.mfa.disable(authOf(req), body.password, body.code);
  }

  @Post('mfa/recovery-codes/regenerate')
  @HttpCode(200)
  @Endpoint({
    summary: 'Replace recovery codes (needs a recent step-up)',
    tags: ['security'],
    response: recoveryCodesResponseSchema,
    successStatus: 200,
    errors: ['STEP_UP_REQUIRED', 'CONFLICT'],
  })
  async regenerate(@Req() req: Request) {
    return { codes: await this.mfa.regenerateRecoveryCodes(authOf(req)) };
  }

  @Get('sessions')
  @Endpoint({
    summary: 'Your active sessions',
    tags: ['security'],
    response: sessionsResponseSchema,
  })
  async listSessions(@Req() req: Request) {
    return { items: await this.sessions.list(authOf(req)) };
  }

  @Delete('sessions/:sessionId')
  @HttpCode(204)
  @Endpoint({
    summary: 'Sign out one of your other sessions',
    tags: ['security'],
    params: sessionIdParamsSchema,
    successStatus: 204,
    errors: ['NOT_FOUND', 'CONFLICT'],
  })
  async revokeSession(@Req() req: Request, @Param('sessionId') sessionId: string) {
    await this.sessions.revoke(authOf(req), sessionId);
  }

  @Post('sessions/revoke-others')
  @HttpCode(200)
  @Endpoint({
    summary: 'Sign out all your other sessions',
    tags: ['security'],
    response: revokeOthersResponseSchema,
    successStatus: 200,
  })
  async revokeOthers(@Req() req: Request) {
    return { revoked: await this.sessions.revokeOthers(authOf(req)) };
  }
}
