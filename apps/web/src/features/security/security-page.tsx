'use client';

import { PageHeader } from '@/components/shell/page-header';

import { MfaSettings } from './mfa-settings';
import { SessionsCard } from './sessions-card';

/** Settings → Your security: second factor and sessions (account-level, any organization). */
export function SecurityPage() {
  return (
    <>
      <PageHeader
        title="Your security"
        description="Two-step verification and where you’re signed in."
      />
      <div className="flex max-w-3xl flex-col gap-6 p-6">
        <MfaSettings />
        <SessionsCard />
      </div>
    </>
  );
}
