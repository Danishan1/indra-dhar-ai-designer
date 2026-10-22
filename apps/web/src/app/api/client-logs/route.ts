import { CLIENT_LOG_MAX_BYTES, clientLogSchema } from '@/lib/logging/client-log-schema';
import { FixedWindowRateLimiter } from '@/lib/logging/rate-limit';
import { getWebLogger } from '@/lib/logging/server-logger';

/**
 * POST /api/client-logs — receives browser errors and writes them to logs/web/client.*.log.
 * Enabled by CLIENT_LOGS_ENABLED (default: development only). Size-capped and rate-limited;
 * payloads are validated and never echoed back. Production observability arrives in I46.
 */
const limiter = new FixedWindowRateLimiter(60, 60_000);

function enabled(): boolean {
  const flag = process.env.CLIENT_LOGS_ENABLED;
  if (flag !== undefined) return flag === 'true' || flag === '1';
  return process.env.NODE_ENV === 'development';
}

export async function POST(request: Request): Promise<Response> {
  if (!enabled()) return new Response(null, { status: 404 });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (!limiter.allow(ip)) return new Response(null, { status: 429 });

  const text = await request.text();
  if (text.length > CLIENT_LOG_MAX_BYTES) return new Response(null, { status: 413 });

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = clientLogSchema.safeParse(json);
  if (!parsed.success) return new Response(null, { status: 400 });

  const { level, ...entry } = parsed.data;
  const logger = await getWebLogger('client');
  logger[level]({ client: entry }, `[browser] ${entry.kind}: ${entry.message}`);
  return new Response(null, { status: 204 });
}
