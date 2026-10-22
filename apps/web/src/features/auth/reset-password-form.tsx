'use client';

import { passwordSchema } from '@ai-designer/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormField } from '@/components/forms/form-field';
import { PasswordInput, PasswordStrength } from '@/components/forms/password-input';
import { Button } from '@/components/ui/button';
import { friendlyMessage, toApiError } from '@/lib/api/errors';

import { authApi } from './api';
import { AuthCard, FormNotice } from './auth-card';

const resetFormSchema = z
  .object({ newPassword: passwordSchema, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

export function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const form = useForm<z.input<typeof resetFormSchema>>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: { newPassword: '', confirm: '' },
  });
  const reset = useMutation({
    mutationFn: (newPassword: string) => authApi.resetPassword(token, newPassword),
    meta: { silent: true },
    onSuccess: () => router.replace('/sign-in?reset=1'),
  });
  const error = reset.error ? toApiError(reset.error) : null;

  if (!token) {
    return (
      <AuthCard title="Link not valid" description="Open the link from the password reset email.">
        <Button asChild variant="outline">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password" description="This signs you out on every device.">
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={form.handleSubmit((v) => reset.mutate(v.newPassword))}
      >
        <FormField
          label="New password"
          error={form.formState.errors.newPassword?.message}
          hint="At least 12 characters."
        >
          <PasswordInput autoComplete="new-password" autoFocus {...form.register('newPassword')} />
        </FormField>
        <PasswordStrength password={form.watch('newPassword')} />
        <FormField label="Confirm new password" error={form.formState.errors.confirm?.message}>
          <PasswordInput autoComplete="new-password" {...form.register('confirm')} />
        </FormField>
        {error ? (
          <FormNotice tone="error">
            {friendlyMessage(error.code)}{' '}
            {error.code === 'TOKEN_INVALID_OR_EXPIRED' ? (
              <Link href="/forgot-password" className="underline">
                Request a new link
              </Link>
            ) : null}
          </FormNotice>
        ) : null}
        <Button type="submit" disabled={reset.isPending}>
          Set new password
        </Button>
      </form>
    </AuthCard>
  );
}
