import { type LogSettings, resolveLogSettings } from '@ai-designer/logger';

import { type ApiEnv, parseApiEnv } from './env.schema.js';

/** Typed, immutable application configuration. Inject `AppConfig` anywhere in the API. */
export class AppConfig {
  readonly env: Readonly<ApiEnv>;
  /** Console/file logging settings (logs/ folder, rotation) — see @ai-designer/logger. */
  readonly logSettings: Readonly<LogSettings>;

  constructor(env: ApiEnv, logSettings?: LogSettings) {
    this.env = Object.freeze({ ...env });
    this.logSettings = Object.freeze(
      logSettings ??
        resolveLogSettings({
          NODE_ENV: env.NODE_ENV,
          LOG_LEVEL: env.LOG_LEVEL,
          LOG_TO_FILE: 'false',
        }),
    );
  }

  static fromProcessEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
    return new AppConfig(parseApiEnv(env), resolveLogSettings(env));
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  /** `/v1/openapi.json` and `/v1/_dev/*` routes: on outside production unless API_DEV_ROUTES=false. */
  get devRoutesEnabled(): boolean {
    return this.env.API_DEV_ROUTES ?? !this.isProduction;
  }

  get storage() {
    return {
      endpoint: this.env.S3_ENDPOINT,
      region: this.env.S3_REGION,
      accessKeyId: this.env.S3_ACCESS_KEY_ID,
      secretAccessKey: this.env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: this.env.S3_FORCE_PATH_STYLE,
      buckets: {
        originals: this.env.S3_BUCKET_ORIGINALS,
        derived: this.env.S3_BUCKET_DERIVED,
        exports: this.env.S3_BUCKET_EXPORTS,
      },
    } as const;
  }
}
