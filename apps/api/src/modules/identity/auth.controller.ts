import {
  acceptedResponseSchema,
  type AcceptedResponse,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  resendVerificationRequestSchema,
  resetPasswordRequestSchema,
  registerRequestSchema,
  sessionResponseSchema,
  type SessionResponse,
  verifyEmailRequestSchema,
} from '@ai-designer/contracts';
import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { RequireAuth } from '../../platform/auth/require-auth.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { AuthService } from './auth.service.js';

const accepted = (message: string): AcceptedResponse => ({ status: 'accepted', message });
const statusSchema = (value: string) => z.object({ status: z.literal(value) });

/** Public + session auth endpoints (I05). Permissions: public routes are rate-limited; see I07. */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(202)
  @Endpoint({
    summary: 'Create an account (sends a verification email)',
    description:
      'Always 202 with the same message, whether or not the address already has an account (FR-SEC-014).',
    tags: ['auth'],
    body: registerRequestSchema,
    response: acceptedResponseSchema,
    successStatus: 202,
    errors: ['RATE_LIMITED'],
  })
  async register(
    @Body() body: z.output<typeof registerRequestSchema>,
    @Req() req: Request,
  ): Promise<AcceptedResponse> {
    await this.auth.register(body, req);
    return accepted('Check your inbox: we sent a link to confirm your email address.');
  }

  @Post('verify-email')
  @HttpCode(200)
  @Endpoint({
    summary: 'Confirm an email address with the token from the email',
    tags: ['auth'],
    body: verifyEmailRequestSchema,
    response: statusSchema('verified'),
    successStatus: 200,
    errors: ['TOKEN_INVALID_OR_EXPIRED', 'RATE_LIMITED'],
  })
  async verifyEmail(@Body() body: z.output<typeof verifyEmailRequestSchema>, @Req() req: Request) {
    await this.auth.verifyEmail(body.token, req);
    return { status: 'verified' as const };
  }

  @Post('resend-verification')
  @HttpCode(202)
  @Endpoint({
    summary: 'Send a new verification email',
    tags: ['auth'],
    body: resendVerificationRequestSchema,
    response: acceptedResponseSchema,
    successStatus: 202,
    errors: ['RATE_LIMITED'],
  })
  async resendVerification(
    @Body() body: z.output<typeof resendVerificationRequestSchema>,
    @Req() req: Request,
  ): Promise<AcceptedResponse> {
    await this.auth.resendVerification(body.email, req);
    return accepted('If this address has an unconfirmed account, we sent a new link.');
  }

  @Post('login')
  @HttpCode(200)
  @Endpoint({
    summary: 'Sign in with email and password (sets the session cookie)',
    tags: ['auth'],
    body: loginRequestSchema,
    response: sessionResponseSchema,
    successStatus: 200,
    errors: ['UNAUTHENTICATED', 'EMAIL_NOT_VERIFIED', 'ACCOUNT_NOT_ACTIVE', 'RATE_LIMITED'],
  })
  async login(
    @Body() body: z.output<typeof loginRequestSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    return { user: await this.auth.login(body, req, res) };
  }

  @Post('logout')
  @HttpCode(204)
  @RequireAuth()
  @Endpoint({
    summary: 'Sign out (revokes the current session)',
    tags: ['auth'],
    successStatus: 204,
    errors: ['UNAUTHENTICATED'],
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req, res);
  }

  @Post('password/forgot')
  @HttpCode(202)
  @Endpoint({
    summary: 'Request a password reset email',
    tags: ['auth'],
    body: forgotPasswordRequestSchema,
    response: acceptedResponseSchema,
    successStatus: 202,
    errors: ['RATE_LIMITED'],
  })
  async forgotPassword(
    @Body() body: z.output<typeof forgotPasswordRequestSchema>,
    @Req() req: Request,
  ): Promise<AcceptedResponse> {
    await this.auth.forgotPassword(body.email, req);
    return accepted('If this address has an account, we sent a link to reset the password.');
  }

  @Post('password/reset')
  @HttpCode(200)
  @Endpoint({
    summary: 'Set a new password with the token from the email (signs out everywhere)',
    tags: ['auth'],
    body: resetPasswordRequestSchema,
    response: statusSchema('password_reset'),
    successStatus: 200,
    errors: ['TOKEN_INVALID_OR_EXPIRED', 'RATE_LIMITED'],
  })
  async resetPassword(
    @Body() body: z.output<typeof resetPasswordRequestSchema>,
    @Req() req: Request,
  ) {
    await this.auth.resetPassword(body, req);
    return { status: 'password_reset' as const };
  }

  @Post('password/change')
  @HttpCode(204)
  @RequireAuth()
  @Endpoint({
    summary: 'Change password (re-enter current password; signs out other sessions)',
    tags: ['auth'],
    body: changePasswordRequestSchema,
    successStatus: 204,
    errors: ['UNAUTHENTICATED', 'RATE_LIMITED'],
  })
  async changePassword(
    @Body() body: z.output<typeof changePasswordRequestSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.changePassword(body, req, res);
  }
}
