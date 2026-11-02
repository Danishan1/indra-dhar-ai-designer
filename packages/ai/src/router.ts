import { type ModelRef, TASK_OPERATION, type AiOperation } from './models.js';
import {
  type AiErrorKind,
  type AiProvider,
  AiProviderError,
  type AiProviderName,
  type AiTask,
} from './types.js';

export interface AttemptRecord {
  task: AiTask;
  operation: AiOperation;
  provider: AiProviderName;
  model: string;
  outcome: 'succeeded' | 'failed';
  errorKind: AiErrorKind | null;
  message: string | null;
  /** 1-based attempt number within this task. */
  attempt: number;
  at: string;
}

/** All candidates failed; `history` says what was tried and why each stopped. */
export class AiRoutingError extends AiProviderError {
  constructor(
    kind: AiErrorKind,
    message: string,
    provider: AiProviderName,
    readonly history: AttemptRecord[],
  ) {
    super(kind, message, provider);
    this.name = 'AiRoutingError';
  }
}

export interface RouterOptions {
  /** Ordered compatible candidates for a task (see `modelChain`). */
  chainFor(task: AiTask): ModelRef[];
  /** An adapter that uses `ref.model` for both text and image calls. */
  create(ref: ModelRef): AiProvider;
  /** Retries of the same model while the vendor is busy (503/429) before moving on. */
  busyRetries: number;
  busyWaitMs: number;
  onBusy?(info: {
    provider: AiProviderName;
    model: string;
    waitMs: number;
    next?: ModelRef;
  }): Promise<void>;
  onAttempt?(record: AttemptRecord): void;
  sleep?(ms: number): Promise<void>;
}

/** Errors no other model of the same provider can fix (key, permission, quota/billing). */
const PROVIDER_FATAL: AiErrorKind[] = ['auth', 'quota', 'not_configured'];
/** Errors where trying another compatible model makes sense. */
const NEXT_MODEL: AiErrorKind[] = [
  'model_unavailable',
  'unsupported',
  'invalid_response',
  'bad_request',
  'unavailable',
  'rate_limited',
];
const BUSY: AiErrorKind[] = ['unavailable', 'rate_limited'];

/**
 * Capability-safe routing with retry and fallback (ADR-057). Each task runs on the first model of
 * its chain; transient errors are retried with backoff, model problems move to the next compatible
 * model, key/permission/quota errors skip the rest of that provider, safety refusals stop. Every
 * attempt is reported (`onAttempt`) so the job can keep a fallback history.
 */
export function routedProvider(opts: RouterOptions): AiProvider & { history: AttemptRecord[] } {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const history: AttemptRecord[] = [];
  const deadProviders = new Set<AiProviderName>();
  const adapters = new Map<string, AiProvider>();
  const adapter = (ref: ModelRef) => {
    const key = `${ref.provider}:${ref.model}`;
    let a = adapters.get(key);
    if (!a) {
      a = opts.create(ref);
      adapters.set(key, a);
    }
    return a;
  };
  const record = (r: Omit<AttemptRecord, 'at'>) => {
    const full = { ...r, at: new Date().toISOString() };
    history.push(full);
    opts.onAttempt?.(full);
  };

  async function run<T>(task: AiTask, call: (p: AiProvider) => Promise<T>): Promise<T> {
    const operation = TASK_OPERATION[task];
    const chain = opts.chainFor(task);
    if (chain.length === 0)
      throw new AiRoutingError(
        'unsupported',
        `No configured model supports ${operation.replaceAll('_', ' ')}. Add a provider key or pick a compatible model in Settings → AI.`,
        'fake',
        [],
      );
    let attempt = 0;
    let last: AiProviderError | null = null;
    for (const [i, ref] of chain.entries()) {
      if (deadProviders.has(ref.provider)) continue;
      for (let round = 0; ; round++) {
        attempt++;
        try {
          const out = await call(adapter(ref));
          record({
            task,
            operation,
            provider: ref.provider,
            model: ref.model,
            outcome: 'succeeded',
            errorKind: null,
            message: null,
            attempt,
          });
          return out;
        } catch (err) {
          const e =
            err instanceof AiProviderError
              ? err
              : new AiProviderError(
                  'bad_request',
                  err instanceof Error ? err.message : String(err),
                  ref.provider,
                );
          last = e;
          record({
            task,
            operation,
            provider: ref.provider,
            model: ref.model,
            outcome: 'failed',
            errorKind: e.kind,
            message: e.message.slice(0, 300),
            attempt,
          });
          if (e.kind === 'refused')
            throw new AiRoutingError(e.kind, e.message, ref.provider, [...history]);
          if (PROVIDER_FATAL.includes(e.kind)) {
            deadProviders.add(ref.provider);
            break;
          }
          if (BUSY.includes(e.kind) && round < opts.busyRetries) {
            const waitMs = opts.busyWaitMs * (round + 1);
            await opts.onBusy?.({ provider: ref.provider, model: ref.model, waitMs });
            await sleep(waitMs);
            continue;
          }
          if (NEXT_MODEL.includes(e.kind)) {
            const next = chain.slice(i + 1).find((r) => !deadProviders.has(r.provider));
            if (next)
              await opts.onBusy?.({ provider: ref.provider, model: ref.model, waitMs: 0, next });
            break;
          }
          throw new AiRoutingError(e.kind, e.message, ref.provider, [...history]);
        }
      }
    }
    const kind = last?.kind ?? 'unavailable';
    throw new AiRoutingError(
      kind,
      last ? `${last.message} (tried ${chain.map((c) => c.model).join(', ')})` : 'No usable model',
      last?.provider ?? chain[0]!.provider,
      [...history],
    );
  }

  const head = (task: AiTask) => opts.chainFor(task)[0];
  const textHead = head('garment_decomposition');
  const imageHead = head('image_design_view');
  return {
    name: textHead?.provider ?? imageHead?.provider ?? 'fake',
    models: { text: textHead?.model ?? '—', image: imageHead?.model ?? '—' },
    capabilities: {
      vision: true,
      multiImage: true,
      structuredOutput: true,
      imageGeneration: !!imageHead,
      referenceImages: true,
      accurateMeasurements: false,
    },
    history,
    generateStructured: (req) => run(req.task, (p) => p.generateStructured(req)),
    generateImage: (req) => run(req.task, (p) => p.generateImage(req)),
  };
}
