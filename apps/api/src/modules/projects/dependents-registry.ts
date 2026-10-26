import { Injectable } from '@nestjs/common';

import type { AuthzContext } from '../../platform/authz/authorizer.js';

export interface ProjectRef {
  id: string;
  organizationId: string;
}

export interface DependentCounter {
  /** Shown in the deletion warning, e.g. "Designs". */
  label: string;
  count(project: ProjectRef): Promise<number>;
}

/** Copies a module's content from one project into its duplicate (runs after the copy exists). */
export type ProjectDuplicator = (
  ctx: AuthzContext,
  source: ProjectRef,
  target: ProjectRef,
) => Promise<void>;

/** Returns a reason when the project must not be completed yet (e.g. unresolved reviews), else null. */
export type CompletionCheck = (project: ProjectRef) => Promise<string | null>;

/**
 * Hooks other modules plug into the project lifecycle (module boundaries: projects never reads their
 * tables). I12 registers design counts and design duplication, I28 completion checks for unresolved reviews, I42 deliverables.
 */
@Injectable()
export class ProjectLifecycleRegistry {
  private readonly counters = new Map<string, DependentCounter>();
  private readonly checks = new Map<string, CompletionCheck>();
  private readonly duplicators = new Map<string, ProjectDuplicator>();

  registerDuplicator(name: string, duplicator: ProjectDuplicator): void {
    this.duplicators.set(name, duplicator);
  }

  unregisterDuplicator(name: string): void {
    this.duplicators.delete(name);
  }

  async runDuplicators(ctx: AuthzContext, source: ProjectRef, target: ProjectRef): Promise<void> {
    for (const duplicate of this.duplicators.values()) await duplicate(ctx, source, target);
  }

  registerDependents(type: string, counter: DependentCounter): void {
    this.counters.set(type, counter);
  }

  registerCompletionCheck(name: string, check: CompletionCheck): void {
    this.checks.set(name, check);
  }

  unregisterCompletionCheck(name: string): void {
    this.checks.delete(name);
  }

  unregisterDependents(type: string): void {
    this.counters.delete(type);
  }

  /** Significant dependents with a non-zero count (FR-PRJ-091). */
  async dependentsOf(project: ProjectRef) {
    const items: { type: string; label: string; count: number }[] = [];
    for (const [type, counter] of this.counters) {
      const count = await counter.count(project);
      if (count > 0) items.push({ type, label: counter.label, count });
    }
    return { items, total: items.reduce((sum, i) => sum + i.count, 0) };
  }

  /** Reasons blocking completion (FR-PRJ-085); empty when completion is allowed. */
  async completionBlockers(project: ProjectRef): Promise<string[]> {
    const blockers: string[] = [];
    for (const check of this.checks.values()) {
      const reason = await check(project);
      if (reason) blockers.push(reason);
    }
    return blockers;
  }
}
