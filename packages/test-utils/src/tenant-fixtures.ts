import type { TestClient } from './http-client.js';

/** How the fixtures create signed-in users and read invitation tokens (API test helpers). */
export interface TenantFixtureDeps {
  baseUrl: string;
  /** Registers, verifies and signs in a new user. */
  signUp(email: string, displayName: string): Promise<TestClient>;
  /** Reads the invitation token emailed to `email`. */
  invitationToken(email: string): Promise<string>;
  newEmail(prefix: string): string;
}

export interface TenantMember {
  client: TestClient;
  email: string;
  membershipId: string;
}

export interface TenantFixture {
  orgId: string;
  name: string;
  owner: TenantMember;
  /** One member per requested role, joined through the invitation flow. */
  members: Record<string, TenantMember>;
  /** A pending invitation (for invitation-scoped routes). */
  pendingInvitationId: string;
}

async function expectStatus(res: Response, status: number, what: string): Promise<unknown> {
  if (res.status !== status) throw new Error(`${what}: ${res.status} ${await res.text()}`);
  return status === 204 ? null : res.json();
}

/**
 * Creates an organization with an owner and one member per role (via invite → accept), plus a
 * pending invitation. Two calls give the Org A / Org B pair for isolation tests.
 */
export async function createTenant(
  deps: TenantFixtureDeps,
  name: string,
  roles: readonly string[] = [],
): Promise<TenantFixture> {
  const ownerEmail = deps.newEmail('owner');
  const ownerClient = await deps.signUp(ownerEmail, `${name} Owner`);
  const org = (await expectStatus(
    await ownerClient.post('/v1/orgs', { name }),
    201,
    'create org',
  )) as { id: string; membership: { id: string } };

  const members: Record<string, TenantMember> = {};
  for (const role of roles) {
    const email = deps.newEmail(role.replace(/_/g, '-'));
    await expectStatus(
      await ownerClient.post(`/v1/orgs/${org.id}/invitations`, { email, role }),
      201,
      `invite ${role}`,
    );
    const token = await deps.invitationToken(email);
    const client = await deps.signUp(email, `${name} ${role}`);
    const accepted = (await expectStatus(
      await client.post('/v1/invitations/accept', { token }),
      200,
      `accept ${role}`,
    )) as { organization: { membership: { id: string } } };
    members[role] = { client, email, membershipId: accepted.organization.membership.id };
  }
  const pending = (await expectStatus(
    await ownerClient.post(`/v1/orgs/${org.id}/invitations`, {
      email: deps.newEmail('pending'),
      role: 'viewer',
    }),
    201,
    'pending invitation',
  )) as { id: string };

  return {
    orgId: org.id,
    name,
    owner: { client: ownerClient, email: ownerEmail, membershipId: org.membership.id },
    members,
    pendingInvitationId: pending.id,
  };
}
