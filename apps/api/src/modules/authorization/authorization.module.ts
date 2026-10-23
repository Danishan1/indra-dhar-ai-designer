import { syncAuthorizationCatalog } from '@ai-designer/db';
import { Global, Injectable, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';

import { AUTHORIZER } from '../../platform/authz/authorizer.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';

import { AuthorizationController } from './authorization.controller.js';
import { AuthorizationService } from './authorization.service.js';
import { EffectivePermissionsService } from './effective-permissions.service.js';
import { ResourceGrantService } from './grants.service.js';
import { RolePermissions } from './role-permissions.js';
import { SecurityPolicyService } from './security-policy.service.js';

/** Mirrors the code catalog into the database before the API serves requests (idempotent). */
@Injectable()
class AuthorizationCatalogBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger('AuthorizationCatalog');

  constructor(
    private readonly prisma: PrismaService,
    private readonly rolePermissions: RolePermissions,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const result = await syncAuthorizationCatalog(this.prisma);
    if (result.rolePermissionsAdded || result.rolePermissionsRemoved)
      this.logger.log(result, 'role permissions updated from the catalog');
    await this.rolePermissions.reload();
  }
}

/**
 * Authorization (SS-01, I07): PDP (`AUTHORIZER`), role → permission mapping, resource grants,
 * effective permissions, security policies. Owns the roles, permissions, role_permissions,
 * resource_grants and security_policies tables. Global so every module can share grants/policies.
 */
@Global()
@Module({
  controllers: [AuthorizationController],
  providers: [
    AuthorizationService,
    { provide: AUTHORIZER, useExisting: AuthorizationService },
    RolePermissions,
    ResourceGrantService,
    EffectivePermissionsService,
    SecurityPolicyService,
    AuthorizationCatalogBootstrap,
  ],
  exports: [AUTHORIZER, AuthorizationService, ResourceGrantService, SecurityPolicyService],
})
export class AuthorizationModule {}
