'use client';

import { emailSchema } from '@ai-designer/contracts';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2Icon, Loader2Icon } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { friendlyMessage, toApiError } from '@/lib/api/errors';

import { authApi } from './api';
import { AuthCard, FormNotice } from './auth-card';

/** Landing page of the confirmation link: consumes the token once, then offers sign-in. */
export function VerifyEmail() {
  const token = useSearchParams().get('token') ?? '';
  const verify = useMutation({ mutationFn: authApi.verifyEmail, meta: { silent: true } });
  const started = useRef(false);
  useEffect(() => {
    if (token && !started.current) {
      started.current = true;
      verify.mutate(token);
    }
  }, [token, verify]);

  if (verify.isSuccess) {
    return (
      <AuthCard title="Email confirmed">
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2Icon className="size-10 text-status-ok" aria-hidden />
          <p className="text-[13px] text-muted-foreground">
            Your account is active. Sign in to start designing.
          </p>
          <Button asChild>
            <Link href="/sign-in?verified=1">Sign in</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }
  if (token && !verify.isError) {
    return (
      <AuthCard title="Confirming your email…">
        <div className="flex justify-center p-4" role="status">
          <Loader2Icon
            className="size-6 animate-spin text-muted-foreground"
            aria-label="Confirming"
          />
        </div>
      </AuthCard>
    );
  }
  return (
    <ResendVerification
      error={
        verify.error
          ? friendlyMessage(toApiError(verify.error).code)
          : 'This page needs the link from your email.'
      }
    />
  );
}

function ResendVerification({ error }: { error: string }) {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const resend = useMutation({ mutationFn: authApi.resendVerification, meta: { silent: true } });
  return (
    <AuthCard title="Link not valid" description={error}>
      {resend.isSuccess ? (
        <FormNotice tone="success">{resend.data.message}</FormNotice>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = emailSchema.safeParse(email);
            if (!parsed.success) {
              setFieldError('Enter a valid email address');
              return;
            }
            setFieldError(undefined);
            resend.mutate(parsed.data);
          }}
        >
          <FormField label="Email" error={fieldError}>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
          <Button type="submit" disabled={resend.isPending}>
            Send a new confirmation link
          </Button>
        </form>
      )}
      <Link
        href="/sign-in"
        className="text-center text-[13px] text-primary underline-offset-4 hover:underline"
      >
        Back to sign in
      </Link>
    </AuthCard>
  );
}
