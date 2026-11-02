'use client';

import type {
  AiModel,
  AiOperationKey,
  AiSettings,
  TestModelResponse,
} from '@ai-designer/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2Icon,
  KeyRoundIcon,
  RefreshCwIcon,
  Trash2Icon,
  XCircleIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shell/page-header';
import { ErrorState, LoadingState } from '@/components/states/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';
import { cn } from '@/lib/utils';

import { aiSettingsApi } from './api';

const PROVIDER_LABEL = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  fake: 'Demo (offline)',
} as const;
const CAP_LABEL: Record<string, string> = {
  text: 'Text',
  vision: 'Image input',
  multi_image: 'Multiple images',
  structured_output: 'Structured (JSON)',
  image_generation: 'Image generation',
  image_editing: 'Image editing',
};
const STATUS: Record<string, { label: string; cls: string }> = {
  connected: { label: 'Connected', cls: 'text-status-confirmed' },
  invalid: { label: 'Key rejected', cls: 'text-destructive' },
  error: { label: 'Check failed', cls: 'text-status-needs-review' },
  not_configured: { label: 'No key', cls: 'text-muted-foreground' },
};
const SOURCE: Record<string, string> = {
  organization: 'Organization key',
  server: 'Server key (.env)',
  builtin: 'Built in',
  none: '—',
};

const refKey = (r: { provider: string; model: string }) => `${r.provider}:${r.model}`;

/**
 * Settings → AI models (ADR-057): provider keys (validated by listing the provider's models, stored
 * encrypted, never shown again), discovered models with their capabilities, the model per
 * operation (or automatic) and the fallback order that results.
 */
export function AiSettingsPage() {
  const { active } = useOrganization();
  const queryClient = useQueryClient();
  const key = queryKeys.org(active.id).aiSettings();
  const settings = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => aiSettingsApi.get(active.id, signal),
  });
  const set = (data: AiSettings) => {
    queryClient.setQueryData(key, data);
    void queryClient.invalidateQueries({ queryKey: queryKeys.org(active.id).aiStatus() });
  };

  if (settings.isPending) return <LoadingState />;
  if (settings.isError)
    return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  const s = settings.data;
  return (
    <div className="flex flex-col">
      <PageHeader
        title="AI models"
        description="Connect providers, see which of their models can do what, and choose the model for each step. Keys are stored encrypted and never shown again."
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
        {!s.canManage ? (
          <p
            className="rounded-md border p-3 text-[13px] text-muted-foreground"
            data-testid="credentials-hint"
          >
            Adding keys and choosing models needs the <strong>Credential admin</strong> role and
            two-step verification (owners can assign the role in Settings → Members). Until then the
            server’s keys from <code>.env</code> are used.
          </p>
        ) : null}
        <section aria-label="Providers" className="grid gap-4 md:grid-cols-2">
          {s.providers
            .filter((p) => p.provider !== 'fake')
            .map((p) => (
              <ProviderCard
                key={p.provider}
                settings={s}
                provider={p.provider as 'gemini' | 'openai'}
                onSaved={set}
              />
            ))}
        </section>
        <Preferences settings={s} onSaved={set} />
        <section aria-label="Discovered models" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Discovered models</h2>
          <p className="text-[12px] text-muted-foreground">
            From each provider’s model listing for your key. Capabilities are evaluated per model —
            only models with every required capability are offered for an operation.
          </p>
          <ModelTable settings={s} />
        </section>
      </div>
    </div>
  );
}

function ProviderCard({
  settings,
  provider,
  onSaved,
}: {
  settings: AiSettings;
  provider: 'gemini' | 'openai';
  onSaved: (s: AiSettings) => void;
}) {
  const { active } = useOrganization();
  const p = settings.providers.find((x) => x.provider === provider)!;
  const [apiKey, setApiKey] = useState('');
  const save = useMutation({
    mutationFn: () => aiSettingsApi.saveKey(active.id, provider, apiKey.trim()),
    onSuccess: (s) => {
      setApiKey('');
      onSaved(s);
      toast.success(`${PROVIDER_LABEL[provider]} connected`);
    },
  });
  const remove = useMutation({
    mutationFn: () => aiSettingsApi.removeKey(active.id, provider),
    onSuccess: onSaved,
  });
  const refresh = useMutation({
    mutationFn: () => aiSettingsApi.refresh(active.id, provider),
    onSuccess: onSaved,
  });
  const st = STATUS[p.status] ?? STATUS['error']!;
  const usable = (p.models as AiModel[]).filter((m) => m.capabilities.length > 0).length;
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4" data-testid={`provider-${provider}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{PROVIDER_LABEL[provider]}</h2>
        <span
          className={cn('flex items-center gap-1 text-[13px]', st.cls)}
          data-testid="provider-status"
        >
          {p.status === 'connected' ? (
            <CheckCircle2Icon className="size-4" />
          ) : p.status === 'not_configured' ? null : (
            <XCircleIcon className="size-4" />
          )}
          {st.label}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-muted-foreground">Key</dt>
        <dd>
          {SOURCE[p.source]}{' '}
          {p.keyHint ? <span className="text-muted-foreground">{p.keyHint}</span> : null}
        </dd>
        <dt className="text-muted-foreground">Models</dt>
        <dd>
          {p.models.length} listed · {usable} usable
        </dd>
        {p.checkedAt ? (
          <>
            <dt className="text-muted-foreground">Checked</dt>
            <dd>{new Date(p.checkedAt).toLocaleString()}</dd>
          </>
        ) : null}
      </dl>
      {p.lastError ? (
        <p
          className="rounded-md border border-destructive/40 p-2 text-[12px] text-destructive"
          role="alert"
        >
          {p.lastError}
        </p>
      ) : null}
      {settings.canManage ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (apiKey.trim()) save.mutate();
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            aria-label={`${PROVIDER_LABEL[provider]} API key`}
            placeholder={p.source === 'organization' ? 'Replace the key…' : 'Paste an API key…'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <Button type="submit" disabled={!apiKey.trim() || save.isPending}>
            <KeyRoundIcon /> {save.isPending ? 'Checking…' : 'Save & discover'}
          </Button>
        </form>
      ) : null}
      {save.isError ? (
        <p role="alert" className="text-[12px] text-destructive">
          {save.error.message}
        </p>
      ) : null}
      {settings.canManage && p.source !== 'none' ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
          >
            <RefreshCwIcon /> Re-check & refresh models
          </Button>
          {p.source === 'organization' ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              <Trash2Icon /> Remove key
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Preferences({
  settings,
  onSaved,
}: {
  settings: AiSettings;
  onSaved: (s: AiSettings) => void;
}) {
  const { active } = useOrganization();
  const [prefs, setPrefs] = useState(settings.preferences);
  const [cross, setCross] = useState(settings.crossProviderFallback);
  const [tests, setTests] = useState<Record<string, TestModelResponse>>({});
  const save = useMutation({
    mutationFn: () =>
      aiSettingsApi.update(active.id, { preferences: prefs, crossProviderFallback: cross }),
    onSuccess: (s) => {
      onSaved(s);
      toast.success('Model choices saved');
    },
  });
  const test = useMutation({
    mutationFn: (v: {
      operation: AiOperationKey;
      provider: 'gemini' | 'openai' | 'fake';
      model: string;
    }) => aiSettingsApi.test(active.id, v.provider, { operation: v.operation, model: v.model }),
    onSuccess: (r) => setTests((t) => ({ ...t, [`${r.operation}|${r.provider}:${r.model}`]: r })),
  });
  return (
    <section aria-label="Model per operation" className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Model per operation</h2>
      <div className="flex flex-col divide-y rounded-lg border">
        {settings.operations.map((op) => {
          const pref = prefs[op.operation] ?? 'auto';
          const value = pref === 'auto' ? 'auto' : refKey(pref);
          const effective = op.effective;
          const first = effective[0];
          const result = first ? tests[`${op.operation}|${refKey(first)}`] : undefined;
          return (
            <div
              key={op.operation}
              className="grid gap-2 p-3 md:grid-cols-[1fr_280px]"
              data-testid={`op-${op.operation}`}
            >
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-medium">{op.label}</span>
                <span className="flex flex-wrap gap-1">
                  {op.requirements.map((r) => (
                    <Badge key={r} variant="outline" className="text-[10px]">
                      {CAP_LABEL[r] ?? r}
                    </Badge>
                  ))}
                </span>
                <span className="text-[12px] text-muted-foreground" data-testid="effective-chain">
                  {effective.length
                    ? `Order: ${effective.map((e) => `${e.model}${e.provider === 'fake' ? '' : ` (${e.provider})`}`).join(' → ')}`
                    : 'No connected model can do this yet.'}
                </span>
                {result ? (
                  <ul className="text-[12px]">
                    {result.checks.map((c) => (
                      <li
                        key={c.name}
                        className={c.ok ? 'text-status-confirmed' : 'text-destructive'}
                      >
                        {c.ok ? '✓' : '✗'} {c.name}: {c.detail}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <SimpleSelect
                  aria-label={`Model for ${op.label}`}
                  value={value}
                  disabled={!settings.canManage}
                  onValueChange={(v) =>
                    setPrefs((p) => ({
                      ...p,
                      [op.operation]:
                        v === 'auto'
                          ? 'auto'
                          : {
                              provider: v.split(':')[0] as 'gemini' | 'openai',
                              model: v.slice(v.indexOf(':') + 1),
                            },
                    }))
                  }
                  options={[
                    { value: 'auto', label: 'Automatic (best available)' },
                    ...op.compatible.map((c) => ({
                      value: refKey(c),
                      label: `${c.model} · ${c.provider}`,
                    })),
                  ]}
                />
                {settings.canManage && first ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={test.isPending}
                    onClick={() =>
                      test.mutate({
                        operation: op.operation,
                        provider: first.provider,
                        model: first.model,
                      })
                    }
                  >
                    Test {first.model}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={cross}
          disabled={!settings.canManage}
          onChange={(e) => setCross(e.target.checked)}
        />
        Automatic fallback to compatible models of other connected providers
      </label>
      {settings.canManage ? (
        <Button className="self-start" onClick={() => save.mutate()} disabled={save.isPending}>
          Save model choices
        </Button>
      ) : null}
      {save.isError ? (
        <p role="alert" className="text-[12px] text-destructive">
          {save.error.message}
        </p>
      ) : null}
    </section>
  );
}

function ModelTable({ settings }: { settings: AiSettings }) {
  const models = settings.providers
    .filter((p) => p.provider !== 'fake')
    .flatMap((p) => p.models as AiModel[]);
  const [all, setAll] = useState(false);
  const shown = all ? models : models.filter((m) => m.capabilities.length > 0);
  if (!models.length)
    return (
      <p className="text-[13px] text-muted-foreground">
        Connect a provider to discover its models.
      </p>
    );
  return (
    <>
      <label className="flex items-center gap-2 text-[12px]">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        Show models we cannot use too (
        {models.length - models.filter((m) => m.capabilities.length > 0).length})
      </label>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-[12px]" aria-label="Models">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2">Model</th>
              <th className="p-2">Provider</th>
              <th className="p-2">Capabilities</th>
              <th className="p-2">Stage</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={`${m.provider}:${m.id}`} className="border-t">
                <td className="p-2 font-mono">{m.id}</td>
                <td className="p-2">{m.provider}</td>
                <td className="p-2">
                  {m.capabilities.length ? (
                    m.capabilities.map((c) => CAP_LABEL[c] ?? c).join(', ')
                  ) : (
                    <span className="text-muted-foreground">not usable here</span>
                  )}
                </td>
                <td className="p-2">{m.stage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
