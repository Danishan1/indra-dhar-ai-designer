import type { Prisma } from '@ai-designer/db';
import { Injectable } from '@nestjs/common';

export interface CommitContext {
  organizationId: string;
  designId: string;
  /** Id the new revision will get (it is inserted right after the hooks run). */
  revisionId: string;
}

/** Runs inside the commit transaction; returns ids to record on the revision (e.g. operation ids). */
export type CommitHook = (tx: Prisma.TransactionClient, commit: CommitContext) => Promise<string[]>;

/**
 * Lets other modules take part in a commit without the designs module reading their tables: the
 * operations module (I14) links its pending operations to the new revision (OPR-004).
 */
@Injectable()
export class DesignCommitHooks {
  private readonly hooks = new Map<string, CommitHook>();

  register(name: string, hook: CommitHook): void {
    this.hooks.set(name, hook);
  }

  async run(tx: Prisma.TransactionClient, commit: CommitContext): Promise<string[]> {
    const ids: string[] = [];
    for (const hook of this.hooks.values()) ids.push(...(await hook(tx, commit)));
    return ids;
  }
}
