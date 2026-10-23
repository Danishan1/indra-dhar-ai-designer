'use client';

import { useQuery } from '@tanstack/react-query';
import { MailIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { LoadingState } from '@/components/states/states';
import { AuthCard } from '@/features/auth/auth-card';
import { safeReturnTo } from '@/features/auth/return-to';
import { useSession } from '@/features/auth/session-provider';
import { queryKeys } from '@/lib/query/keys';

import { orgsApi } from './api';
import { CreateOrganizationForm } from './create-organization-form';

/** First run without an organization: create one, or use an invitation link from email. */
export function Onboarding() {
  const router = useRouter();
  const returnTo = safeReturnTo(useSearchParams().get('returnTo'));
  const { user } = useSession();
  const orgs = useQuery({
    queryKey: queryKeys.myOrgs(),
    queryFn: ({ signal }) => orgsApi.mine(signal),
  });
  const hasActive = orgs.data?.items.some((o) => o.membership.status === 'active') ?? false;
  useEffect(() => {
    if (hasActive) router.replace(returnTo);
  }, [hasActive, router, returnTo]);

  if (orgs.isPending || hasActive) return <LoadingState className="min-h-dvh" />;
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <AuthCard
        title={`Welcome${user ? `, ${user.displayName}` : ''}`}
        description="Designs, libraries and tech packs live in an organization. Create one to get started."
        footer={
          <span className="inline-flex items-center gap-1.5">
            <MailIcon className="size-3.5" aria-hidden /> Invited by a colleague? Open the link in
            the invitation email.
          </span>
        }
      >
        <CreateOrganizationForm onCreated={() => router.replace(returnTo)} />
      </AuthCard>
    </main>
  );
}
