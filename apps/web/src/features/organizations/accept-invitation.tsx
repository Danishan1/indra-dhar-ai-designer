'use client';

import { OrgRoleLabels } from '@ai-designer/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { LoadingState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import { AuthCard, FormNotice } from '@/features/auth/auth-card';
import { useSession } from '@/features/auth/session-provider';
import { friendlyMessage, toApiError } from '@/lib/api/errors';
import { PreferenceKeys, writePreference } from '@/lib/local-preferences';
import { queryKeys } from '@/lib/query/keys';

import { orgsApi } from './api';

/** Invitation landing page (public): preview → sign in/up as the invited email → accept. */
export function AcceptInvitation() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const queryClient = useQueryClient();
  const { status, user } = useSession();
  const preview = useQuery({
    queryKey: ['invitation-preview', token],
    queryFn: () => orgsApi.previewInvitation(token),
    enabled: !!token,
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => orgsApi.acceptInvitation(token),
    meta: { silent: true },
    onSuccess: async ({ organization }) => {
      writePreference(PreferenceKeys.activeOrganization, organization.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.myOrgs() });
      router.replace('/');
    },
  });

  if (!token) {
    return (
      <AuthCard
        title="Invitation link incomplete"
        description="Open the link from the invitation email."
      >
        <Button asChild variant="outline">
          <Link href="/">Go to the app</Link>
        </Button>
      </AuthCard>
    );
  }
  if (preview.isPending || status === 'loading') return <LoadingState />;
  if (preview.isError) {
    return (
      <AuthCard
        title="Invitation not valid"
        description={friendlyMessage(toApiError(preview.error).code)}
      >
        <p className="text-[13px] text-muted-foreground">
          Ask the person who invited you to send a new invitation.
        </p>
      </AuthCard>
    );
  }
  const inv = preview.data;
  const returnTo = `/invitations/accept?token=${encodeURIComponent(token)}`;
  const acceptError = accept.error ? toApiError(accept.error) : null;
  return (
    <AuthCard
      title={`Join ${inv.organizationName}`}
      description={
        <>
          {inv.invitedByName} invited <strong>{inv.email}</strong> as{' '}
          {inv.roles.map((r) => OrgRoleLabels[r]).join(', ')}.
        </>
      }
    >
      <div className="flex items-center gap-3 rounded-md border p-3">
        <Building2Icon className="size-6 text-primary" aria-hidden />
        <div className="flex flex-col">
          <span className="text-sm font-medium">{inv.organizationName}</span>
          <span className="text-xs text-muted-foreground">
            Valid until {new Date(inv.expiresAt).toLocaleDateString()}
          </span>
        </div>
      </div>
      {status === 'authenticated' && user ? (
        <>
          {user.email !== inv.email ? (
            <FormNotice tone="error">
              You are signed in as {user.email}. This invitation is for {inv.email} — sign out and
              sign in with that address.
            </FormNotice>
          ) : null}
          {acceptError ? (
            <FormNotice tone="error">
              {acceptError.message || friendlyMessage(acceptError.code)}
            </FormNotice>
          ) : null}
          <Button
            disabled={accept.isPending || user.email !== inv.email}
            onClick={() => accept.mutate()}
          >
            Accept invitation
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <Button asChild>
            <Link href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
              Sign in as {inv.email}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sign-up">Create an account</Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            New here? Create an account with {inv.email}, confirm it, then open this invitation link
            again.
          </p>
        </div>
      )}
    </AuthCard>
  );
}
