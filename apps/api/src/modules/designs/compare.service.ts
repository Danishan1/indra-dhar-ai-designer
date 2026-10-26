import type { CompareResponse } from '@ai-designer/contracts';
import { Injectable } from '@nestjs/common';

import type { AuthzContext } from '../../platform/authz/authorizer.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';

import { RevisionService } from './revision.service.js';
import { WorkingCopyService } from './working-copy.service.js';

/** CompareRevisions (FR-PRJ-030/031, DSN-011): any two revisions, or a revision vs the working copy. */
@Injectable()
export class CompareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revisions: RevisionService,
    private readonly workingCopies: WorkingCopyService,
  ) {}

  async compare(
    ctx: AuthzContext,
    designId: string,
    query: { from: string; to: string },
  ): Promise<CompareResponse> {
    const from = await this.revisions.loadVerified(
      this.prisma,
      ctx.organizationId,
      query.from,
      designId,
    );
    let toState;
    let toSide: CompareResponse['to'];
    if (query.to === 'working') {
      toState = await this.workingCopies.currentState(ctx.organizationId, designId);
      toSide = { kind: 'working', id: null, label: 'Working copy' };
    } else {
      const to = await this.revisions.loadVerified(
        this.prisma,
        ctx.organizationId,
        query.to,
        designId,
      );
      toState = to.state;
      toSide = { kind: 'revision', id: to.row.id, label: to.row.displayId };
    }
    const { diff, lines } = this.revisions.diff(from.state, toState);
    return {
      from: { kind: 'revision', id: from.row.id, label: from.row.displayId },
      to: toSide,
      summary: lines,
      diff: diff as unknown as Record<string, unknown>,
    };
  }
}
