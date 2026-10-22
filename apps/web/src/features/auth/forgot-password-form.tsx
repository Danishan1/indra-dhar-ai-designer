'use client';

import { forgotPasswordRequestSchema } from '@ai-designer/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { friendlyMessage, toApiError } from '@/lib/api/errors';

import { authApi } from './api';
import { AuthCard, FormNotice } from './auth-card';

export function ForgotPasswordForm() {
  const form = useForm<
    z.input<typeof forgotPasswordRequestSchema>,
    unknown,
    z.output<typeof forgotPasswordRequestSchema>
  >({
    resolver: zodResolver(forgotPasswordRequestSchema),
    defaultValues: { email: '' },
  });
  const forgot = useMutation({ mutationFn: authApi.forgotPassword, meta: { silent: true } });
  return (
    <AuthCard
      title="Reset your password"
      description="Enter your account email. If it exists, we send a link that is valid for 1 hour."
      footer={
        <Link className="text-primary underline-offset-4 hover:underline" href="/sign-in">
          Back to sign in
        </Link>
      }
    >
      {forgot.isSuccess ? (
        <FormNotice tone="success">{forgot.data.message}</FormNotice>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={form.handleSubmit((v) => forgot.mutate(v.email))}
        >
          <FormField label="Email" error={form.formState.errors.email?.message}>
            <Input type="email" autoComplete="email" autoFocus {...form.register('email')} />
          </FormField>
          {forgot.error ? (
            <FormNotice tone="error">{friendlyMessage(toApiError(forgot.error).code)}</FormNotice>
          ) : null}
          <Button type="submit" disabled={forgot.isPending}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
