'use client';

import type { Me } from '@ai-designer/contracts';
import { useMutation } from '@tanstack/react-query';
import { Loader2Icon, ShieldCheckIcon } from 'lucide-react';
import { useState } from 'react';

import { FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CodeInput } from '@/features/security/code-input';
import { friendlyMessage, toApiError } from '@/lib/api/errors';

import { authApi } from './api';
import { AuthCard, FormNotice } from './auth-card';

/** Second step of sign-in: authenticator code, or a recovery code. */
export function MfaChallenge({
  onDone,
  onCancel,
}: {
  onDone: (user: Me) => void;
  onCancel: () => void;
}) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState('');
  const verify = useMutation({
    mutationFn: () => authApi.verifyMfa(useRecovery ? { recoveryCode: value } : { code: value }),
    meta: { silent: true },
    onSuccess: (res) => {
      if (res.status === 'authenticated') onDone(res.user);
    },
  });
  const error = verify.error ? toApiError(verify.error) : null;
  return (
    <AuthCard
      title="Two-step verification"
      description={
        useRecovery
          ? 'Enter one of the recovery codes you saved. Each code works once.'
          : 'Enter the 6-digit code from your authenticator app.'
      }
    >
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          verify.mutate();
        }}
      >
        <FormField label={useRecovery ? 'Recovery code' : 'Authentication code'}>
          {useRecovery ? (
            <Input
              autoFocus
              autoComplete="off"
              placeholder="abcde-12345"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          ) : (
            <CodeInput autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          )}
        </FormField>
        {error ? (
          <FormNotice tone="error">
            {error.code === 'UNAUTHENTICATED' ? error.message : friendlyMessage(error.code)}
          </FormNotice>
        ) : null}
        <Button type="submit" disabled={verify.isPending || !value.trim()}>
          {verify.isPending ? (
            <Loader2Icon className="animate-spin" aria-hidden />
          ) : (
            <ShieldCheckIcon aria-hidden />
          )}
          Verify
        </Button>
        <div className="flex justify-between text-xs">
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline"
            onClick={() => {
              setUseRecovery((v) => !v);
              setValue('');
              verify.reset();
            }}
          >
            {useRecovery ? 'Use the authenticator app' : 'Use a recovery code'}
          </button>
          <button
            type="button"
            className="text-muted-foreground underline-offset-4 hover:underline"
            onClick={onCancel}
          >
            Cancel sign-in
          </button>
        </div>
      </form>
    </AuthCard>
  );
}
