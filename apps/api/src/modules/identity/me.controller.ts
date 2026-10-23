import { type Me, meSchema, updateMeRequestSchema } from '@ai-designer/contracts';
import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { z } from 'zod';

import { AuthenticatedOnly } from '../../platform/authz/decorators.js';
import { currentUserId } from '../../platform/authz/principal.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { AccountService } from './account.service.js';

@Controller('me')
@AuthenticatedOnly()
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
