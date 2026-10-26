import { type DynamicModule, Module } from '@nestjs/common';

import { ArtifactsModule } from './modules/artifacts/artifacts.module.js';
import { AssetsModule } from './modules/assets/assets.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthorizationModule } from './modules/authorization/authorization.module.js';
import { DesignsModule } from './modules/designs/designs.module.js';
import { DevExamplesModule } from './modules/dev-examples/dev-examples.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { type AppConfig } from './platform/config/app-config.js';
import { AppConfigModule } from './platform/config/config.module.js';
import { HealthModule } from './platform/health/health.module.js';
import { LoggingModule } from './platform/logging/logging.module.js';
import { MailModule } from './platform/mail/mail.module.js';
import { buildOpenApiDocument, collectControllers } from './platform/openapi/openapi-builder.js';
import { OPENAPI_DOCUMENT, OpenApiController } from './platform/openapi/openapi.controller.js';
import { PlatformModule } from './platform/platform.module.js';
import { PrismaModule } from './platform/prisma/prisma.module.js';
import { QueueModule } from './platform/queue/queue.module.js';
import { RateLimitModule } from './platform/rate-limit/rate-limit.module.js';
import { RedisModule } from './platform/redis/redis.module.js';
import { StorageModule } from './platform/storage/storage.module.js';

/** Business modules (I05+) are appended here. */
const FEATURE_MODULES: DynamicModule['imports'] = [
  AuthorizationModule,
  AuditModule,
  IdentityModule,
  AssetsModule,
  ProjectsModule,
  DesignsModule,
  ArtifactsModule,
  OrganizationsModule,
];

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    const devRoutes = config.devRoutesEnabled;
    const dynamic: DynamicModule = {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(config),
        LoggingModule,
        PrismaModule,
        RedisModule,
        StorageModule,
        QueueModule,
        MailModule,
        RateLimitModule,
        PlatformModule,
        HealthModule,
        ...(FEATURE_MODULES ?? []),
        ...(devRoutes ? [DevExamplesModule] : []),
      ],
      controllers: devRoutes ? [OpenApiController] : [],
      providers: [
        {
          provide: OPENAPI_DOCUMENT,
          useValue: () =>
            buildOpenApiDocument(collectControllers(dynamic), {
              version: config.env.APP_VERSION,
              includeInternal: true,
            }),
        },
      ],
    };
    return dynamic;
  }
}
