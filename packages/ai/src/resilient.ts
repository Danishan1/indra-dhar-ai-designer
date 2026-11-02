import { type AiProvider, AiProviderError } from './types.js';

export interface ResilienceOptions {
  /** Used once when the primary provider is still busy after the extra rounds. */
  fallback?: AiProvider | null;
  /** Extra rounds while the provider is busy (503/429 after its own retries). */
  busyRetries: number;
  busyWaitMs: number;
  /** Told before each wait / switch, e.g. to show "Gemini is busy — retrying in 20 s". */
  onBusy?(info: {
    provider: string;
    waitMs: number;
    round: number;
    switchingTo?: string;
  }): Promise<void>;
  sleep?(ms: number): Promise<void>;
}

const isBusy = (err: unknown) =>
  err instanceof AiProviderError && (err.kind === 'unavailable' || err.kind === 'rate_limited');

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Wraps a provider so a temporarily overloaded vendor does not fail the job (ADR-056): after the
 * adapter's own retries and model fallbacks, wait and try again a few times, then switch to the
 * configured fallback provider once. Other errors (auth, refused, invalid) are thrown at once.
 */
export function resilientProvider(primary: AiProvider, opts: ResilienceOptions): AiProvider {
  const sleep = opts.sleep ?? defaultSleep;
  async function run<T>(call: (p: AiProvider) => Promise<T>): Promise<T> {
    for (let round = 0; ; round++) {
      try {
        return await call(primary);
      } catch (err) {
        if (!isBusy(err)) throw err;
        if (round < opts.busyRetries) {
          const waitMs = opts.busyWaitMs * (round + 1);
          await opts.onBusy?.({ provider: primary.name, waitMs, round: round + 1 });
          await sleep(waitMs);
          continue;
        }
        if (opts.fallback) {
          await opts.onBusy?.({
            provider: primary.name,
            waitMs: 0,
            round: round + 1,
            switchingTo: opts.fallback.name,
          });
          return call(opts.fallback);
        }
        throw err;
      }
    }
  }
  return {
    name: primary.name,
    models: primary.models,
    capabilities: primary.capabilities,
    generateStructured: (req) => run((p) => p.generateStructured(req)),
    generateImage: (req) => run((p) => p.generateImage(req)),
  };
}
