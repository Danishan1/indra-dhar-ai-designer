import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Storage abstraction (TECH-GDP-001 §3.6, ADR-021). The domain never talks to S3 directly, so any
 * S3-compatible store (SeaweedFS, Garage, AWS S3, …) can be swapped in. Buckets are private:
 * objects are reachable only through the API or short-lived signed URLs (SEC-002).
 */
export interface ObjectStorage {
  bucketExists(bucket: string): Promise<boolean>;
  ensureBucket(bucket: string): Promise<'created' | 'exists'>;
  putObject(input: PutObjectInput): Promise<void>;
  getObject(bucket: string, key: string): Promise<Buffer>;
  /** First `bytes` bytes (for magic-byte sniffing without downloading everything). */
  getObjectHead(bucket: string, key: string, bytes: number): Promise<Buffer>;
  headObject(
    bucket: string,
    key: string,
  ): Promise<{ sizeBytes: number; contentType?: string } | null>;
  copyObject(
    from: { bucket: string; key: string },
    to: { bucket: string; key: string },
  ): Promise<void>;
  deleteObject(bucket: string, key: string): Promise<void>;
  /** Short-lived GET URL against the browser-facing endpoint. */
  presignGet(bucket: string, key: string, options: PresignOptions): Promise<string>;
}

export interface PresignOptions {
  expiresInSeconds: number;
  /** Forces a download filename / disposition in the response. */
  contentDisposition?: string;
  contentType?: string;
}

export interface PutObjectInput {
  bucket: string;
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  checksumSha256?: string;
}

export interface S3StorageConfig {
  endpoint: string;
  /** Browser-reachable endpoint for signed URLs (defaults to `endpoint`). */
  publicEndpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

function isNotFound(err: unknown): boolean {
  if (err instanceof S3ServiceException) {
    return (
      err.$metadata.httpStatusCode === 404 ||
      err.name === 'NotFound' ||
      err.name === 'NoSuchBucket' ||
      err.name === 'NoSuchKey'
    );
  }
  return false;
}

function client(config: S3StorageConfig, endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Avoid extra checksum headers some S3-compatible servers reject.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly signer: S3Client;

  constructor(config: S3StorageConfig) {
    this.client = client(config, config.endpoint);
    this.signer =
      config.publicEndpoint && config.publicEndpoint !== config.endpoint
        ? client(config, config.publicEndpoint)
        : this.client;
  }

  async bucketExists(bucket: string): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  async ensureBucket(bucket: string): Promise<'created' | 'exists'> {
    if (await this.bucketExists(bucket)) return 'exists';
    await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
    return 'created';
  }

  async putObject(input: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ...(input.checksumSha256 ? { Metadata: { sha256: input.checksumSha256 } } : {}),
      }),
    );
  }

  async getObject(bucket: string, key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) throw new Error(`Object ${bucket}/${key} has no body`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async getObjectHead(bucket: string, key: string, bytes: number): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
    );
    if (!res.Body) return Buffer.alloc(0);
    return Buffer.from(await res.Body.transformToByteArray()).subarray(0, bytes);
  }

  async headObject(bucket: string, key: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return {
        sizeBytes: res.ContentLength ?? 0,
        ...(res.ContentType ? { contentType: res.ContentType } : {}),
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async copyObject(from: { bucket: string; key: string }, to: { bucket: string; key: string }) {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: to.bucket,
        Key: to.key,
        CopySource: `${from.bucket}/${encodeURIComponent(from.key).replace(/%2F/g, '/')}`,
      }),
    );
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  presignGet(bucket: string, key: string, options: PresignOptions): Promise<string> {
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(options.contentDisposition
          ? { ResponseContentDisposition: options.contentDisposition }
          : {}),
        ...(options.contentType ? { ResponseContentType: options.contentType } : {}),
      }),
      { expiresIn: options.expiresInSeconds },
    );
  }

  destroy(): void {
    this.client.destroy();
    if (this.signer !== this.client) this.signer.destroy();
  }
}
