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

  /** Origins accepted for cookie-authenticated state-changing requests (CSRF, FR-SEC-049). */
  get trustedOrigins(): string[] {
    const extra = (this.env.AUTH_TRUSTED_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    return [
      ...new Set([new URL(this.env.APP_BASE_URL).origin, ...extra.map((o) => new URL(o).origin)]),
    ];
  }

  /** Upload limits per media family (bytes / pixels). */
  get assetLimits() {
    const mb = 1024 * 1024;
    return {
      imageBytes: this.env.ASSET_MAX_IMAGE_MB * mb,
      svgBytes: this.env.ASSET_MAX_SVG_MB * mb,
      documentBytes: this.env.ASSET_MAX_DOCUMENT_MB * mb,
      maxPixels: this.env.ASSET_MAX_PIXELS,
      urlTtlSeconds: this.env.ASSET_URL_TTL_SECONDS,
    } as const;
  }

  get sessionCookieName(): string {
    return this.env.AUTH_COOKIE_SECURE ? '__Host-aid_session' : 'aid_session';
  }

  get storage() {
    return {
      endpoint: this.env.S3_ENDPOINT,
      ...(this.env.S3_PUBLIC_ENDPOINT ? { publicEndpoint: this.env.S3_PUBLIC_ENDPOINT } : {}),
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
