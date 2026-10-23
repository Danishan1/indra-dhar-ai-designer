'use client';

import { useMutation } from '@tanstack/react-query';
import { ShieldCheckIcon } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { FormField } from '@/components/forms/form-field';
import { PasswordInput } from '@/components/forms/password-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { authApi } from '@/features/auth/api';
import { FormNotice } from '@/features/auth/auth-card';
import { setStepUpHandler } from '@/lib/api/client';
import { type ApiError, friendlyMessage, toApiError } from '@/lib/api/errors';

import { CodeInput } from './code-input';

/**
 * Global step-up (FR-SEC-040): when any request answers STEP_UP_REQUIRED, this dialog asks for a
 * fresh authenticator code (or the password for accounts without two-step verification), then the
 * API client retries the original request once.
 */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<{ method: 'totp' | 'password' } | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const [value, setValue] = useState('');

  const ask = useCallback((error: ApiError) => {
    const method = error.details?.['method'] === 'password' ? 'password' : 'totp';
    resolver.current?.(false);
    setValue('');
    setRequest({ method });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  useEffect(() => {
    setStepUpHandler(ask);
    return () => setStepUpHandler(null);
  }, [ask]);

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setRequest(null);
  };

  const verify = useMutation({
    mutationFn: () =>
      authApi.stepUp(request?.method === 'password' ? { password: value } : { code: value }),
    meta: { silent: true },
    onSuccess: () => finish(true),
  });
  const error = verify.error ? toApiError(verify.error) : null;

  return (
    <>
      {children}
      <Dialog
        open={!!request}
        onOpenChange={(open) => {
          if (!open) finish(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm it’s you</DialogTitle>
            <DialogDescription>
              This action needs a recent verification.{' '}
              {request?.method === 'password'
                ? 'Enter your password.'
                : 'Enter the current code from your authenticator app.'}
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              verify.mutate();
            }}
          >
            <FormField label={request?.method === 'password' ? 'Password' : 'Authentication code'}>
              {request?.method === 'password' ? (
                <PasswordInput
                  autoFocus
                  autoComplete="current-password"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              ) : (
                <CodeInput autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
              )}
            </FormField>
            {error ? (
              <FormNotice tone="error">
                {error.code === 'VALIDATION_FAILED' ? error.message : friendlyMessage(error.code)}
              </FormNotice>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => finish(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={verify.isPending || !value.trim()}>
                <ShieldCheckIcon aria-hidden /> Confirm
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
