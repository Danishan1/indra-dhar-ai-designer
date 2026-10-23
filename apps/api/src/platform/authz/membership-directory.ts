import { Injectable } from '@nestjs/common';

import type { MembershipAccess } from './access-cache.js';

/**
 * Port through which the PDP reads live memberships without importing the organizations module
 * (which owns the tables). The organizations module registers its implementation on init; until
 * then every decision fails closed.
 */
export interface MembershipDirectory {
  /** Live (active or suspended) membership of `userId` in an *active* organization, or null. */
  findAccess(organizationId: string, userId: string): Promise<MembershipAccess | null>;
  /** Live membership by id within the organization, or null. */
  findById(organizationId: string, membershipId: string): Promise<MembershipAccess | null>;
}

@Injectable()
export class MembershipDirectoryRegistry {
  private directory: MembershipDirectory | null = null;

  register(directory: MembershipDirectory): void {
    this.directory = directory;
  }

  get(): MembershipDirectory {
    if (!this.directory) throw new Error('No membership directory registered');
    return this.directory;
  }
}
