import type { z } from 'zod';

import { type AiProviderName, AiProviderError, type StructuredRequest } from './types.js';

/** Extracts a JSON value from model text (handles ```json fences and leading prose). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const body = fenced ? fenced[1]!.trim() : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.search(/[[{]/);
    const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new Error('no JSON in the response');
  }
}

export function structuredPrompt<T>(req: StructuredRequest<T>, correction?: string): string {
  return [
    req.prompt,
    '',
    'Respond with ONE JSON object only (no prose, no markdown). Shape:',
    req.shapeHint,
    ...(correction
      ? ['', `Your previous answer did not match the required shape: ${correction}. Fix it.`]
      : []),
  ].join('\n');
}

/**
 * Runs a structured call with one corrective retry: parse → validate with zod → on mismatch ask
 * again with the validation error. Throws `invalid_response` when still wrong.
 */
export async function withValidation<T>(
  provider: AiProviderName,
  req: StructuredRequest<T>,
  call: (
    prompt: string,
  ) => Promise<{ text: string; inputTokens: number | null; outputTokens: number | null }>,
): Promise<{ data: T; inputTokens: number | null; outputTokens: number | null }> {
  let correction: string | undefined;
  let tokensIn = 0;
  let tokensOut = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await call(structuredPrompt(req, correction));
    tokensIn += res.inputTokens ?? 0;
    tokensOut += res.outputTokens ?? 0;
    let raw: unknown;
    try {
      raw = extractJson(res.text);
    } catch (e) {
      correction = (e as Error).message;
      continue;
    }
    const parsed = (req.schema as z.ZodType<T>).safeParse(raw);
    if (parsed.success)
      return { data: parsed.data, inputTokens: tokensIn, outputTokens: tokensOut };
    correction = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
  }
  throw new AiProviderError(
    'invalid_response',
    `The model's answer did not match the expected structure (${correction ?? 'unknown'})`,
    provider,
  );
}

export function toBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64');
}

/** Maps an HTTP failure to an error kind (never includes request headers or keys). */
export function httpError(provider: AiProviderName, status: number, body: string): AiProviderError {
  const detail = body.slice(0, 300).replace(/\s+/g, ' ');
  if (status === 401 || status === 403)
    return new AiProviderError(
      'auth',
      `The ${provider} API key was rejected (${status})`,
      provider,
    );
  if (status === 429)
    return new AiProviderError('rate_limited', `${provider} rate limit or quota reached`, provider);
  if (status >= 500)
    return new AiProviderError('unavailable', `${provider} is unavailable (${status})`, provider);
  return new AiProviderError(
    'bad_request',
    `${provider} refused the request (${status}): ${detail}`,
    provider,
  );
}
