/**
 * Permission catalog (`<resource>.<action>`) — filled in I07 (see docs/plan/03-domain-model.md §4,
 * ADR-033). Every protected endpoint maps to one of these keys.
 */
export const Permissions = {} as const;

export type PermissionKey = (typeof Permissions)[keyof typeof Permissions];
