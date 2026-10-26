import { describe, expect, it } from 'vitest';

import {
  allowedActions,
  canTransition,
  type LifecycleAction,
  LIFECYCLE_TRANSITIONS,
  LifecycleActions,
  type ProjectStatus,
  ProjectStatuses,
} from './lifecycle.js';
import { createProjectRequestSchema, updateProjectRequestSchema } from './schemas.js';

/** The edges of the SPEC-006 §7.5 diagram, as (from, action) → to. */
const DIAGRAM: [ProjectStatus, LifecycleAction, ProjectStatus][] = [
  ['ACTIVE', 'hold', 'ON_HOLD'],
  ['ON_HOLD', 'resume', 'ACTIVE'],
  ['ACTIVE', 'complete', 'COMPLETED'],
  ['COMPLETED', 'reopen', 'ACTIVE'],
  ['ACTIVE', 'archive', 'ARCHIVED'],
  ['ON_HOLD', 'archive', 'ARCHIVED'],
  ['COMPLETED', 'archive', 'ARCHIVED'],
  ['ARCHIVED', 'restore', 'ACTIVE'],
  ['ACTIVE', 'delete', 'DELETED'],
  ['ON_HOLD', 'delete', 'DELETED'],
  ['COMPLETED', 'delete', 'DELETED'],
  ['ARCHIVED', 'delete', 'DELETED'],
];

describe('project lifecycle transitions (SPEC-006 §7.5)', () => {
  it('allows exactly the edges of the diagram, no others', () => {
    for (const from of ProjectStatuses) {
      for (const action of LifecycleActions) {
        const edge = DIAGRAM.find(([f, a]) => f === from && a === action);
        expect(canTransition(from, action), `${from} --${action}-->`).toBe(Boolean(edge));
        if (edge) expect(LIFECYCLE_TRANSITIONS[action].to).toBe(edge[2]);
      }
    }
  });

  it('DELETED is terminal', () => {
    expect(allowedActions('DELETED')).toEqual([]);
  });

  it('lists the available actions per status', () => {
    expect(allowedActions('ACTIVE')).toEqual(['hold', 'complete', 'archive', 'delete']);
    expect(allowedActions('ARCHIVED')).toEqual(['restore', 'delete']);
    expect(allowedActions('COMPLETED')).toEqual(['reopen', 'archive', 'delete']);
  });

  it('reopen needs a reason and the archive permission', () => {
    expect(LIFECYCLE_TRANSITIONS.reopen).toMatchObject({
      reasonRequired: true,
      permission: 'project.archive',
    });
  });
});

describe('project metadata schemas', () => {
  it('trims, drops empty values and de-duplicates tags', () => {
    const parsed = createProjectRequestSchema.parse({
      name: '  Spring Shirt  ',
      season: '   ',
      tags: ['denim', 'denim', ' summer '],
    });
    expect(parsed).toMatchObject({
      name: 'Spring Shirt',
      season: null,
      tags: ['denim', 'summer'],
      visibility: 'organization',
    });
  });

  it('rejects a blank name and requires the version on update', () => {
    expect(createProjectRequestSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(updateProjectRequestSchema.safeParse({ name: 'x' }).success).toBe(false);
    expect(updateProjectRequestSchema.safeParse({ expectedVersion: 1, name: 'x' }).success).toBe(
      true,
    );
  });
});
