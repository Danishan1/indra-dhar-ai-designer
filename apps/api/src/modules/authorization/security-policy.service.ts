import { newId, type TxClient } from '@ai-designer/db';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../platform/prisma/prisma.service.js';

/**
 * Organization security policy defaults (version 1). Enforcement arrives with the features that
 * read each key: MFA/step-up (I08), separation of duties (I28/I43), external sharing (I43).
 */
export const DEFAULT_SECURITY_POLICY = {
  requireMfaForAdmins: false,
  stepUpForSensitiveActions: true,
  allowExternalSharing: false,
  requireIndependentDesignApproval: false,
  requireIndependentRelease: false,
} as const;
export type SecurityPolicyConfig = { [K in keyof typeof DEFAULT_SECURITY_POLICY]: boolean };

/** Versioned, append-only security policy per organization (owned by the authorization module). */
@Injectable()
export class SecurityPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Called inside the organization-creation transaction. */
  async createDefault(tx: TxClient, organizationId: string, createdBy: string): Promise<void> {
    await tx.securityPolicy.create({
      data: {
        id: newId(),
        organizationId,
        version: 1,
        config: { ...DEFAULT_SECURITY_POLICY },
        createdBy,
      },
    });
  }

  async current(
    organizationId: string,
  ): Promise<{ version: number; config: SecurityPolicyConfig }> {
    const row = await this.prisma.securityPolicy.findFirst({
      where: { organizationId },
      orderBy: { version: 'desc' },
    });
    return {
      version: row?.version ?? 1,
      config: {
        ...DEFAULT_SECURITY_POLICY,
        ...((row?.config as Partial<SecurityPolicyConfig>) ?? {}),
      },
    };
  }
}
