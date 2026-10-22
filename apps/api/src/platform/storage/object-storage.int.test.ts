import { afterAll, describe, expect, it } from 'vitest';

import { AppConfig } from '../config/app-config.js';

import { S3ObjectStorage } from './object-storage.js';

describe('S3ObjectStorage (integration)', () => {
  const config = AppConfig.fromProcessEnv();
  const storage = new S3ObjectStorage(config.storage);
  const bucket = config.storage.buckets.derived;

  afterAll(() => storage.destroy());

  it('reports existing and missing buckets', async () => {
    expect(await storage.bucketExists(bucket)).toBe(true);
    expect(await storage.bucketExists('aid-test-does-not-exist')).toBe(false);
  });

  it('ensureBucket is idempotent', async () => {
    expect(await storage.ensureBucket(bucket)).toBe('exists');
  });

  it('round-trips an object', async () => {
    const key = `it/${Date.now()}.txt`;
    await storage.putObject({ bucket, key, body: 'hello garment', contentType: 'text/plain' });
    expect((await storage.getObject(bucket, key)).toString()).toBe('hello garment');
    await storage.deleteObject(bucket, key);
    await expect(storage.getObject(bucket, key)).rejects.toThrow();
  });
});
