import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { type DestinationStream, type Level, multistream, type StreamEntry } from 'pino';
import pretty from 'pino-pretty';
import roll from 'pino-roll';

import type { LogSettings } from './settings.js';

export interface LogFiles {
  /** Folder for this service, e.g. logs/api */
  dir: string;
  /** Base path of the "everything at LOG_LEVEL" stream, e.g. logs/api/api */
  all: string;
  /** Base path of the error-only stream, e.g. logs/api/api-error */
  errors: string;
}

export function logFilesFor(settings: LogSettings, service: string, stream = service): LogFiles {
  const dir = join(settings.dir, service);
  return { dir, all: join(dir, stream), errors: join(dir, `${stream}-error`) };
}

async function rollingFile(file: string, settings: LogSettings): Promise<DestinationStream> {
  // Produces e.g. logs/api/api.2026-10-22.1.log, rotating daily and by size.
  return (await roll({
    file,
    extension: '.log',
    frequency: 'daily',
    dateFormat: 'yyyy-MM-dd',
    size: settings.maxSize,
    limit: { count: settings.retention },
    mkdir: true,
  })) as unknown as DestinationStream;
}

/**
 * Builds the destinations for a service logger:
 *  - console: JSON (default) or pretty (LOG_PRETTY=true)
 *  - logs/<service>/<stream>.<date>.<n>.log   — everything at LOG_LEVEL and above
 *  - logs/<service>/<stream>-error.<date>.<n>.log — errors and fatals only
 * File output is enabled by LOG_TO_FILE (default on in development). The logs/ folder is git-ignored.
 */
export async function createLogDestination(
  settings: LogSettings,
  service: string,
  options: { stream?: string; console?: boolean } = {},
): Promise<DestinationStream> {
  const level = (settings.level === 'silent' ? 'fatal' : settings.level) as Level;
  const entries: StreamEntry[] = [];

  if (options.console !== false && settings.level !== 'silent') {
    entries.push({
      level,
      stream: settings.pretty
        ? pretty({ colorize: true, singleLine: true, translateTime: 'SYS:HH:MM:ss.l', sync: true })
        : process.stdout,
    });
  }

  if (settings.toFile && settings.level !== 'silent') {
    const files = logFilesFor(settings, service, options.stream);
    mkdirSync(files.dir, { recursive: true });
    entries.push({ level, stream: await rollingFile(files.all, settings) });
    entries.push({ level: 'error', stream: await rollingFile(files.errors, settings) });
  }

  if (entries.length === 0) {
    // Nothing to write to (silent): discard.
    return { write: () => undefined } as DestinationStream;
  }
  return multistream(entries, { dedupe: false });
}
