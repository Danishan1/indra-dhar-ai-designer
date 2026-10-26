/**
 * Project lifecycle state machine (SPEC-006 §7.5, FR-PRJ-083…088). Pure and shared: the API
 * enforces it, the web app uses it to show only the actions that can work. Project status is
 * separate from design status and never implies approval or production readiness (§7.1).
 */
export const ProjectStatuses = ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED', 'DELETED'] as const;
export type ProjectStatus = (typeof ProjectStatuses)[number];

/** Statuses a user can see and filter by (DELETED is gone from every normal view). */
export const VisibleProjectStatuses = ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] as const;
export type VisibleProjectStatus = (typeof VisibleProjectStatuses)[number];

export const LifecycleActions = [
  'hold',
  'resume',
  'complete',
  'reopen',
  'archive',
  'restore',
  'delete',
] as const;
export type LifecycleAction = (typeof LifecycleActions)[number];

interface Transition {
  from: readonly ProjectStatus[];
  to: ProjectStatus;
  /** Permission needed (SPEC-006 §8.9; reopen/restore are the "with permission" arrows). */
  permission: 'project.edit' | 'project.archive' | 'project.delete';
  /** A reason is mandatory (recorded with the actor, FR-PRJ-086). */
  reasonRequired: boolean;
}

export const LIFECYCLE_TRANSITIONS: Record<LifecycleAction, Transition> = {
  hold: { from: ['ACTIVE'], to: 'ON_HOLD', permission: 'project.edit', reasonRequired: false },
  resume: { from: ['ON_HOLD'], to: 'ACTIVE', permission: 'project.edit', reasonRequired: false },
  complete: {
    from: ['ACTIVE'],
    to: 'COMPLETED',
    permission: 'project.edit',
    reasonRequired: false,
  },
  reopen: {
    from: ['COMPLETED'],
    to: 'ACTIVE',
    permission: 'project.archive',
    reasonRequired: true,
  },
  archive: {
    from: ['ACTIVE', 'ON_HOLD', 'COMPLETED'],
    to: 'ARCHIVED',
    permission: 'project.archive',
    reasonRequired: false,
  },
  restore: {
    from: ['ARCHIVED'],
    to: 'ACTIVE',
    permission: 'project.archive',
    reasonRequired: false,
  },
  delete: {
    from: ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'],
    to: 'DELETED',
    permission: 'project.delete',
    reasonRequired: false,
  },
};

export function canTransition(status: ProjectStatus, action: LifecycleAction): boolean {
  return LIFECYCLE_TRANSITIONS[action].from.includes(status);
}

/** Actions that are valid from `status` (the UI also checks the caller's permissions). */
export function allowedActions(status: ProjectStatus): LifecycleAction[] {
  return LifecycleActions.filter((a) => canTransition(status, a));
}

/** Metadata can be edited while the project is being worked on or paused. */
export function isEditable(status: ProjectStatus): boolean {
  return status === 'ACTIVE' || status === 'ON_HOLD';
}
