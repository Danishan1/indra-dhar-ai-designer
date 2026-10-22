import { type ApiEnv, parseApiEnv } from './env.schema.js';

/** Typed, immutable application configuration. Inject `AppConfig` anywhere in the API. */
export class AppConfig {
  readonly env: Readonly<ApiEnv>;

  constructor(env: ApiEnv) {
    this.env = Object.freeze({ ...env });
  }

  static fromProcessEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
    return new AppConfig(parseApiEnv(env));
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
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
