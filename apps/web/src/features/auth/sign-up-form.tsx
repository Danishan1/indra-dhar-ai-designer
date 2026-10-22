'use client';

import { registerRequestSchema, type RegisterRequest } from '@ai-designer/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Loader2Icon, MailCheckIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { FormField } from '@/components/forms/form-field';
import { PasswordInput, PasswordStrength } from '@/components/forms/password-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { friendlyMessage, toApiError } from '@/lib/api/errors';

import { authApi } from './api';
import { AuthCard, FormNotice } from './auth-card';

export function SignUpForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const form = useForm<RegisterRequest, unknown, z.output<typeof registerRequestSchema>>({
    resolver: zodResolver(registerRequestSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  });
  const register = useMutation({
    mutationFn: authApi.register,
    meta: { silent: true },
    onSuccess: (_data, values) => setSentTo(String(values.email)),
  });
  const resend = useMutation({
    mutationFn: authApi.resendVerification,
    meta: { silent: true },
    onSuccess: () => setResent(true),
  });
  const password = form.watch('password');

  if (sentTo) {
    return (
      <AuthCard
        title="Check your inbox"
        description={
          <>
            We sent a confirmation link to <strong>{sentTo}</strong>. It is valid for 24 hours.
          </>
        }
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <MailCheckIcon className="size-10 text-primary" aria-hidden />
          <p className="text-[13px] text-muted-foreground">
            Didn&apos;t get it? Check spam, or send a new link.
          </p>
          {resent ? (
            <FormNotice tone="success">
              If the address needs confirming, a new link is on its way.
            </FormNotice>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={resend.isPending}
              onClick={() => resend.mutate(sentTo)}
            >
              Send a new link
            </Button>
          )}
          <Link
            href="/sign-in"
            className="text-[13px] text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  const error = register.error ? toApiError(register.error) : null;
  return (
    <AuthCard
      title="Create your account"
      description="Design garments with a structured model and AI assistance."
      footer={
        <>
          Already have an account?{' '}
          <Link className="text-primary underline-offset-4 hover:underline" href="/sign-in">
            Sign in
          </Link>
        </>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={form.handleSubmit((values) => register.mutate(values))}
      >
        <FormField label="Your name" error={form.formState.errors.displayName?.message}>
          <Input autoComplete="name" autoFocus {...form.register('displayName')} />
        </FormField>
        <FormField label="Email" error={form.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" {...form.register('email')} />
        </FormField>
        <FormField
          label="Password"
          error={form.formState.errors.password?.message}
          hint="At least 12 characters. A passphrase works well."
        >
          <PasswordInput autoComplete="new-password" {...form.register('password')} />
        </FormField>
        <PasswordStrength password={password} />
        {error ? <FormNotice tone="error">{friendlyMessage(error.code)}</FormNotice> : null}
        <Button type="submit" disabled={register.isPending}>
          {register.isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : null} Create
          account
        </Button>
      </form>
    </AuthCard>
  );
}
