/**
 * The storage client lives in @ai-designer/media (shared with the worker, I09). This module keeps
 * the API's injection token.
 */
export {
  type ObjectStorage,
  type PutObjectInput,
  S3ObjectStorage,
  type S3StorageConfig,
} from '@ai-designer/media';

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
