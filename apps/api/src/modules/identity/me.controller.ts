import { type Me, meSchema, updateMeRequestSchema } from '@ai-designer/contracts';
import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { z } from 'zod';

import { currentUserId, RequireAuth } from '../../platform/auth/require-auth.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { AccountService } from './account.service.js';

@Controller('me')
@RequireAuth()
export class MeController {
  constructor(private readonly accounts: AccountService) {}

  @Get()
  @Endpoint({
    summary: 'Current user',
    tags: ['me'],
    response: meSchema,
    errors: ['UNAUTHENTICATED'],
  })
  get(): Promise<Me> {
    return this.accounts.getMe(currentUserId());
  }

  @Patch()
  @Endpoint({
    summary: 'Update profile',
    tags: ['me'],
    body: updateMeRequestSchema,
    response: meSchema,
    errors: ['UNAUTHENTICATED'],
  })
  update(@Body() body: z.output<typeof updateMeRequestSchema>): Promise<Me> {
    return this.accounts.updateDisplayName(currentUserId(), body.displayName);
  }
}
