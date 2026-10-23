import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module.js';

import { AuditQueryController } from './audit-query.controller.js';
import { AuditQueryService } from './audit-query.service.js';

/**
 * Audit search (SS-17, I08). Reads `audit_events` (written through the platform AuditService);
 * actor names come from IdentityModule's AccountService. Reused by the admin console (I45).
 */
@Module({
  imports: [IdentityModule],
  controllers: [AuditQueryController],
  providers: [AuditQueryService],
})
export class AuditModule {}
