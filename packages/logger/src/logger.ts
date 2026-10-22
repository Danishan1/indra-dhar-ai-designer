import { type DestinationStream, type Logger, type LoggerOptions, pino } from 'pino';

import { createLogDestination } from './destinations.js';
import { REDACT_PATHS, REDACTION_CENSOR } from './redaction.js';
import { type LogSettings, resolveLogSettings } from './settings.js';

export interface ServiceLoggerOptions {
  /** Service name, also the sub-folder under logs/ (api, worker, web). */
  service: string;
  /** File stream name inside the service folder (default = service), e.g. "client" → logs/web/client.*.log */
  stream?: string;
  version?: string;
  base?: Record<string, unknown>;
  settings?: LogSettings;
  console?: boolean;
}

/** Common pino options (level, redaction, base fields) shared by every service. */
export function baseLoggerOptions(
  settings: LogSettings,
  opts: ServiceLoggerOptions,
): LoggerOptions {
  return {
    level: settings.level,
    redact: { paths: [...REDACT_PATHS], censor: REDACTION_CENSOR },
    base: {
      service: opts.service,
      ...(opts.version ? { version: opts.version } : {}),
      ...opts.base,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
}

/** Creates a pino logger writing to console and (optionally) rotating files under logs/<service>/. */
export async function createServiceLogger(
  opts: ServiceLoggerOptions,
): Promise<{ logger: Logger; destination: DestinationStream; settings: LogSettings }> {
  const settings = opts.settings ?? resolveLogSettings();
  const destination = await createLogDestination(settings, opts.service, {
    ...(opts.stream ? { stream: opts.stream } : {}),
    ...(opts.console === false ? { console: false } : {}),
  });
  return { logger: pino(baseLoggerOptions(settings, opts), destination), destination, settings };
}
