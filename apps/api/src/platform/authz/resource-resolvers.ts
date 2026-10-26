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
