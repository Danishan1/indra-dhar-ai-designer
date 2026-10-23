'use client';

import { loginRequestSchema, type LoginRequest } from '@ai-designer/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { FormField } from '@/components/forms/form-field';
import { PasswordInput } from '@/components/forms/password-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { friendlyMessage, toApiError } from '@/lib/api/errors';

import { authApi } from './api';
import { AuthCard, FormNotice } from './auth-card';
import { MfaChallenge } from './mfa-challenge';
import { safeReturnTo } from './return-to';
import { resetUserData } from './session-provider';

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const returnTo = safeReturnTo(params.get('returnTo'));
  const [resent, setResent] = useState(false);
  const [mfaPending, setMfaPending] = useState(false);
  const form = useForm<LoginRequest, unknown, z.output<typeof loginRequestSchema>>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: '', password: '' },
  });

  const login = useMutation({
    mutationFn: authApi.login,
    meta: { silent: true },
    onSuccess: (data) => {
      if (data.status === 'mfa_required') {
        setMfaPending(true);
        return;
      }
      resetUserData(queryClient, data.user);
      router.replace(returnTo);
    },
  });
  const resend = useMutation({
    mutationFn: authApi.resendVerification,
    meta: { silent: true },
    onSuccess: () => setResent(true),
  });

  const error = login.error ? toApiError(login.error) : null;

  if (mfaPending) {
    return (
      <MfaChallenge
        onDone={(user) => {
          resetUserData(queryClient, user);
          router.replace(returnTo);
        }}
        onCancel={() => {
          void authApi.logout().catch(() => undefined);
          setMfaPending(false);
          login.reset();
        }}
      />
    );
  }

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Sign in to continue to your designs."
      footer={
        <>
          New here?{' '}
          <Link className="text-primary underline-offset-4 hover:underline" href="/sign-up">
            Create an account
          </Link>
        </>
      }
    >
      {params.get('reset') === '1' ? (
        <FormNotice tone="success">Password changed. Sign in with your new password.</FormNotice>
      ) : null}
      {params.get('verified') === '1' ? (
        <FormNotice tone="success">Email confirmed. You can sign in now.</FormNotice>
      ) : null}
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={form.handleSubmit((values) => {
          setResent(false);
          login.mutate(values);
        })}
      >
        <FormField label="Email" error={form.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" autoFocus {...form.register('email')} />
        </FormField>
        <FormField label="Password" error={form.formState.errors.password?.message}>
          <PasswordInput autoComplete="current-password" {...form.register('password')} />
        </FormField>
        <div className="-mt-1 text-right">
          <Link
            href="/forgot-password"
            className="text-xs text-primary underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        {error ? (
          <FormNotice tone="error">
            {error.code === 'UNAUTHENTICATED' ? error.message : friendlyMessage(error.code)}
            {error.code === 'EMAIL_NOT_VERIFIED' ? (
              <span className="mt-2 block">
                {resent ? (
                  'We sent a new confirmation link.'
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={resend.isPending}
                    onClick={() => resend.mutate(form.getValues('email').trim().toLowerCase())}
                  >
                    Send a new confirmation link
                  </Button>
                )}
              </span>
            ) : null}
          </FormNotice>
        ) : null}
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : null} Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
