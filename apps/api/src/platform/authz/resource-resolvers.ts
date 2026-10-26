import { Injectable } from '@nestjs/common';

export interface ResourceResolver {
  /** Human label for "<label> not found" responses. */
  label: string;
  /** Returns the owning organization id, or null when the resource does not exist. */
  organizationOf(id: string): Promise<string | null>;
  /**
   * Resource types with restricted visibility (projects, FR-SEC-094): when true, role permissions
   * alone do not give access — the caller needs `<type>.manage_access` or an explicit grant.
   */
  isRestricted?(id: string): Promise<boolean>;
  /**
   * Child resources (designs, revisions) inherit their parent's restriction: the PDP checks the
   * parent exists in the same tenant, asks the parent's `isRestricted`, and checks grants on the
   * parent (I12, ADR-047).
   */
  governedBy?(id: string): Promise<{ type: string; id: string } | null>;
  /**
   * For restricted resources: the grant action that allows `permission` on this resource type
   * (e.g. on a project, `design.edit` is allowed by a `project.edit` grant). Permissions of the
   * resource's own type map to themselves; unmapped permissions cannot be granted.
   */
  grantActionFor?(permission: string): string | null;
  /**
   * Shared platform resources (the built-in artifact library, I13) belong to no organization:
   * `organizationOf` returns null for them. They are reachable from any organization route, but
   * only for the listed permissions (read/use/copy) — never for writes (FR-SEC-115/116).
   */
  platformAccess?: { isPlatform(id: string): Promise<boolean>; permissions: readonly string[] };
  /** User-private resources: their owner's user id (others get 404), or null when not private. */
  privateOwnerOf?(id: string): Promise<string | null>;
}

/**
 * Resource type → owner lookup, used by the PDP to verify a resource belongs to the request's
 * organization before any permission check (FR-SEC-216). Each module registers its types in
 * `onModuleInit`; resolvers must select only `organization_id` (no N+1, no content).
 */
@Injectable()
export class ResourceResolverRegistry {
  private readonly resolvers = new Map<string, ResourceResolver>();

  register(type: string, resolver: ResourceResolver): void {
    if (this.resolvers.has(type)) throw new Error(`Resource resolver "${type}" already registered`);
    this.resolvers.set(type, resolver);
  }

  get(type: string): ResourceResolver {
    const resolver = this.resolvers.get(type);
    if (!resolver) throw new Error(`No resource resolver registered for "${type}"`);
    return resolver;
  }

  types(): string[] {
    return [...this.resolvers.keys()];
  }
}
