/** Error thrown by garment-model helpers. `code` is stable for callers (the API maps it to AppError). */
export type GarmentModelErrorCode =
  | 'INVALID_UNIT'
  | 'INVALID_VALUE'
  | 'PROMOTION_REFUSED'
  | 'MIGRATION_FAILED'
  | 'UNSUPPORTED_VERSION'
  | 'UNKNOWN_CATEGORY'
  | 'NON_CANONICAL_NUMBER';

export class GarmentModelError extends Error {
  readonly code: GarmentModelErrorCode;
  constructor(code: GarmentModelErrorCode, message: string) {
    super(message);
    this.name = 'GarmentModelError';
    this.code = code;
  }
}
