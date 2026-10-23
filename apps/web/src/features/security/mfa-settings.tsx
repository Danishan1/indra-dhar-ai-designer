'use client';

import type { TotpSetupResponse } from '@ai-designer/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlertIcon, ShieldCheckIcon } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { FormField } from '@/components/forms/form-field';
import { PasswordInput } from '@/components/forms/password-input';
import { ErrorState, LoadingState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormNotice } from '@/features/auth/auth-card';
import { friendlyMessage, toApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query/keys';

import { securityApi } from './api';
import { CodeInput } from './code-input';
import { RecoveryCodes } from './recovery-codes';

function errorText(err: unknown): string {
  const e = toApiError(err);
  return e.code === 'VALIDATION_FAILED' ? e.message : friendlyMessage(e.code);
}

function QrCode({ value }: { value: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    // Rendered locally — the secret never goes to a third-party QR service.
    void QRCode.toString(value, { type: 'svg', margin: 1, width: 176 }).then(setSvg);
  }, [value]);
  if (!svg) return <div className="size-44 rounded-md bg-muted" />;
  return (
    <div
      role="img"
      aria-label="QR code for your authenticator app"
      className="size-44 overflow-hidden rounded-md bg-white p-1"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function EnableFlow({
  setup,
  onClose,
}: {
  setup: { data?: TotpSetupResponse | undefined; error: unknown; isPending: boolean };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const confirm = useMutation({
    mutationFn: () => securityApi.totpConfirm(code),
    meta: { silent: true },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.security.mfa() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.security.sessions() });
    },
  });
  if (confirm.data) {
    return (
      <RecoveryCodes
        codes={confirm.data.codes}
        onDone={() => {
          toast.success('Two-step verification is on');
          onClose();
        }}
      />
    );
  }
  if (setup.isPending || !setup.data) {
    return setup.error ? (
      <FormNotice tone="error">{errorText(setup.error)}</FormNotice>
    ) : (
      <LoadingState />
    );
  }
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        confirm.mutate();
      }}
    >
      <ol className="flex list-decimal flex-col gap-1 pl-4 text-[13px] text-muted-foreground">
        <li>Open an authenticator app (1Password, Google Authenticator, Authy, Microsoft…).</li>
        <li>Scan the QR code, or enter the key manually.</li>
        <li>Type the 6-digit code it shows.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-4">
        <QrCode value={setup.data.otpauthUri} />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted-foreground">Setup key</span>
          <code
            className="rounded bg-muted px-2 py-1 font-mono text-[12px] break-all"
            data-testid="totp-secret"
          >
            {setup.data.secret}
          </code>
        </div>
      </div>
      <FormField label="Code from the app">
        <CodeInput autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
      </FormField>
      {confirm.error ? <FormNotice tone="error">{errorText(confirm.error)}</FormNotice> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={confirm.isPending || !code.trim()}>
          Turn on
        </Button>
      </DialogFooter>
    </form>
  );
}

function DisableFlow({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const disable = useMutation({
    mutationFn: () => securityApi.totpDisable({ password, code }),
    meta: { silent: true },
    onSuccess: async () => {
      toast.success('Two-step verification is off');
      await queryClient.invalidateQueries({ queryKey: queryKeys.security.mfa() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.security.sessions() });
      onClose();
    },
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        disable.mutate();
      }}
    >
      <FormField label="Password">
        <PasswordInput
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>
      <FormField label="Current code">
        <CodeInput value={code} onChange={(e) => setCode(e.target.value)} />
      </FormField>
      {disable.error ? <FormNotice tone="error">{errorText(disable.error)}</FormNotice> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="destructive"
          disabled={disable.isPending || !password || !code}
        >
          Turn off
        </Button>
      </DialogFooter>
    </form>
  );
}

export function MfaSettings() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'enable' | 'disable' | 'codes' | null>(null);
  const status = useQuery({
    queryKey: queryKeys.security.mfa(),
    queryFn: ({ signal }) => securityApi.mfa(signal),
  });
  // Started from the click (not an effect) so exactly one secret is generated per attempt.
  const setup = useMutation({ mutationFn: securityApi.totpSetup, meta: { silent: true } });
  const regenerate = useMutation({
    mutationFn: securityApi.regenerateRecoveryCodes,
    onSuccess: () => {
      setDialog('codes');
      void queryClient.invalidateQueries({ queryKey: queryKeys.security.mfa() });
    },
  });
  if (status.isPending) return <LoadingState />;
  if (status.isError)
    return <ErrorState error={status.error} onRetry={() => void status.refetch()} />;
  const s = status.data;
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" aria-labelledby="mfa-heading">
      <div className="flex items-start gap-3">
        {s.totpEnabled ? (
          <ShieldCheckIcon className="mt-0.5 size-5 text-status-ok" aria-hidden />
        ) : (
          <ShieldAlertIcon className="mt-0.5 size-5 text-status-needs-review" aria-hidden />
        )}
        <div className="flex-1">
          <h2 id="mfa-heading" className="text-sm font-semibold">
            Two-step verification {s.totpEnabled ? 'is on' : 'is off'}
          </h2>
          <p className="text-[13px] text-muted-foreground">
            {s.totpEnabled
              ? `Authenticator app added ${s.totpConfirmedAt ? new Date(s.totpConfirmedAt).toLocaleDateString() : ''}. ${s.recoveryCodesRemaining} recovery code(s) left.`
              : 'Sign-ins and sensitive actions (managing members, roles, billing, credentials, the audit log) need an authenticator app.'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {s.totpEnabled ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={regenerate.isPending}
              onClick={() => regenerate.mutate()}
            >
              New recovery codes
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog('disable')}>
              Turn off
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            onClick={() => {
              setup.reset();
              setup.mutate();
              setDialog('enable');
            }}
          >
            Set up authenticator app
          </Button>
        )}
      </div>
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === 'enable'
                ? 'Set up two-step verification'
                : dialog === 'disable'
                  ? 'Turn off two-step verification'
                  : 'New recovery codes'}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'disable'
                ? 'Enter your password and a current code. Your other sessions will be signed out.'
                : dialog === 'enable'
                  ? 'Your other sessions will be signed out when you turn it on.'
                  : 'The previous codes no longer work.'}
            </DialogDescription>
          </DialogHeader>
          {dialog === 'enable' ? (
            <EnableFlow setup={setup} onClose={() => setDialog(null)} />
          ) : null}
          {dialog === 'disable' ? <DisableFlow onClose={() => setDialog(null)} /> : null}
          {dialog === 'codes' && regenerate.data ? (
            <RecoveryCodes codes={regenerate.data.codes} onDone={() => setDialog(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
