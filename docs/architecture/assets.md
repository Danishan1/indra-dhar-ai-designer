# Assets & storage (I09)

Every file in the platform — uploads, AI outputs, renders, exports — is an **asset**: a row in
`assets` (owned by `modules/assets`) plus an object in private S3-compatible storage. Decisions:
ADR-044 (upload/processing design), ADR-029 (scanner hook). Spec: AST-001…010, SEC-002,
FR-SEC-176/177, FR-RV-035/036, FR-RV-144…149.

## Lifecycle

```
POST /v1/orgs/:orgId/assets/uploads         → pending_upload   (type/size allowlist, rate limit)
PUT  /v1/orgs/:orgId/assets/:id/content     → quarantined      (bytes streamed with a cap, sniffed,
                                                                 stored; job asset.process queued)
worker asset.process (packages/media)       → ready | rejected (re-sniff, size/checksum, scan,
                                                                 SVG sanitize, pixel limit, WebP
                                                                 thumb_256 + preview_1024)
```

- Only `ready` assets are served. `rejected` keeps the row (with `rejectionReason`) and deletes the bytes.
- Derived variants are their own rows: `isDerived`, `parentAssetId`, `variant`, provenance `derived`.
  Lists show originals; `asset.variants` says which variants exist.
- Client MIME types are never trusted: the type comes from magic bytes and must be allowed for the
  `assetType` (`UPLOAD_RULES` in `packages/contracts/src/assets/schemas.ts`).

## Storage layout

- Buckets: `S3_BUCKET_ORIGINALS`, `S3_BUCKET_DERIVED`, `S3_BUCKET_EXPORTS` — all private.
- Keys: `org/{orgId}/{yyyy}/{mm}/{assetId}/{variant}` (`assetObjectKey`); a DB CHECK enforces the
  `org/{organization_id}/` prefix. No dedup across tenants (AST-003).
- `ObjectStorage` port (`packages/media/src/storage.ts`) with `S3ObjectStorage`; the API injects it
  as `OBJECT_STORAGE`.

## Limits (configurable, `.env`)

| Setting                 | Default    | Meaning                                   |
| ----------------------- | ---------- | ----------------------------------------- |
| `ASSET_MAX_IMAGE_MB`    | 25         | PNG/JPEG/WebP                             |
| `ASSET_MAX_SVG_MB`      | 2          | SVG                                       |
| `ASSET_MAX_DOCUMENT_MB` | 50         | PDF                                       |
| `ASSET_MAX_PIXELS`      | 50 000 000 | decompression-bomb guard (API and worker) |
| `ASSET_URL_TTL_SECONDS` | 300        | signed download URL lifetime (30–300)     |
| `ASSET_SCANNER`         | `none`     | worker scanner: `none` · `eicar-test`     |
| `S3_PUBLIC_ENDPOINT`    | —          | host the browser uses for signed URLs     |

## Delivery

- `GET …/assets/:id/url?variant=` → presigned GET (≤ 5 min) after authorization.
- `GET …/assets/:id/content?variant=` → streamed through the API (authorized per request,
  `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; …; sandbox`,
  private cache 5 min). The web app uses it for thumbnails (`features/assets/asset-thumbnail.tsx`).

## Using assets from another module

- **Platform-made files** (AI outputs, renders, exports): `storeGeneratedAsset(deps, {...})` from
  `@ai-designer/media` stores a quarantined original with provenance and emits `AssetUploaded`;
  then queue `asset.process` (or process inline in the worker).
- **Immutable references** (revisions, released tech packs…): register a check so deletion is
  refused while referenced:

  ```ts
  this.assetReferences.register('design_revisions', async ({ id, organizationId }) =>
    (await this.prisma.designRevisionAsset.findFirst({ where: { assetId: id, organizationId } }))
      ? 'used by a revision'
      : null,
  );
  ```

- Never read the `assets` table directly — call `AssetsService` (module boundary).

## Web

`features/assets/`: `UploadDropzone` (drag & drop, progress, errors, thumbnail), `useUpload`
(create → PUT with progress → poll until ready/rejected), `AssetThumbnail`. The **Files** page is a
dev page that moves into project sources in I10.
