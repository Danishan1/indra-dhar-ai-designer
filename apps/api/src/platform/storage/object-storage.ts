import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';

/**
 * Storage abstraction (TECH-GDP-001 §3.6, ADR-021). The domain never talks to S3 directly, so any
 * S3-compatible store (SeaweedFS, Garage, AWS S3, …) can be swapped in. Full asset service: I09.
 */
export interface ObjectStorage {
  bucketExists(bucket: string): Promise<boolean>;
  ensureBucket(bucket: string): Promise<'created' | 'exists'>;
  putObject(input: PutObjectInput): Promise<void>;
  getObject(bucket: string, key: string): Promise<Buffer>;
  deleteObject(bucket: string, key: string): Promise<void>;
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
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

function isNotFound(err: unknown): boolean {
  if (err instanceof S3ServiceException) {
    return (
      err.$metadata.httpStatusCode === 404 || err.name === 'NotFound' || err.name === 'NoSuchBucket'
    );
  }
  return false;
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(config: S3StorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // Avoid extra checksum headers some S3-compatible servers reject.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
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

  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  destroy(): void {
    this.client.destroy();
  }
}
