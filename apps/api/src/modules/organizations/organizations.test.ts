import { describe, expect, it } from 'vitest';

import { effectiveInvitationStatus, hashInvitationToken } from './invitation.service.js';
import { canTransitionMembership, violatesLastOwner } from './membership.service.js';
import { canGrant, canManage } from './roles.js';
import { slugify } from './slug.js';

describe('organization rules', () => {
  it('protects the last active owner (FR-SEC-080)', () => {
    expect(violatesLastOwner(true, 'revoke', 0)).toBe(true);
    expect(violatesLastOwner(true, 'suspend', 0)).toBe(true);
    expect(violatesLastOwner(true, 'revoke', 1)).toBe(false);
    expect(violatesLastOwner(false, 'revoke', 0)).toBe(false);
    expect(violatesLastOwner(true, 'reactivate', 0)).toBe(false);
  });

  it('enforces the membership state machine', () => {
    expect(canTransitionMembership('suspend', 'active')).toBe(true);
    expect(canTransitionMembership('suspend', 'suspended')).toBe(false);
    expect(canTransitionMembership('reactivate', 'suspended')).toBe(true);
    expect(canTransitionMembership('revoke', 'suspended')).toBe(true);
    expect(canTransitionMembership('revoke', 'revoked')).toBe(false);
    expect(canTransitionMembership('reactivate', 'revoked')).toBe(false);
  });

  it('limits authority: no granting above own role, never ownership by invitation (FR-SEC-076)', () => {
    expect(canGrant(['organization_owner'], 'organization_admin')).toBe(true);
    expect(canGrant(['organization_admin'], 'organization_admin')).toBe(true);
    expect(canGrant(['designer'], 'organization_admin')).toBe(false);
    expect(canGrant(['organization_owner'], 'organization_owner')).toBe(false);
    expect(canManage(['organization_admin'], ['organization_admin'])).toBe(false);
    expect(canManage(['organization_admin'], ['designer'])).toBe(true);
    expect(canManage(['organization_owner'], ['organization_owner'])).toBe(true);
  });

  it('treats a pending invitation past expiry as expired; hashes tokens', () => {
    expect(
      effectiveInvitationStatus({ status: 'pending', expiresAt: new Date(Date.now() - 1) }),
    ).toBe('expired');
    expect(
      effectiveInvitationStatus({ status: 'pending', expiresAt: new Date(Date.now() + 60_000) }),
    ).toBe('pending');
    expect(
      effectiveInvitationStatus({ status: 'cancelled', expiresAt: new Date(Date.now() + 60_000) }),
    ).toBe('cancelled');
    expect(hashInvitationToken('abc')).not.toContain('abc');
    expect(hashInvitationToken('abc')).toBe(hashInvitationToken('abc'));
  });

  it('builds slugs', () => {
    expect(slugify('  Ateliér Nord & Co. ')).toBe('atelier-nord-co');
    expect(slugify('!!!')).toBe('org');
  });
});
