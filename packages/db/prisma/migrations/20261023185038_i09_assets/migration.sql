-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "display_id" TEXT NOT NULL,
    "asset_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "media_type" TEXT,
    "size_bytes" BIGINT,
    "checksum_sha256" TEXT,
    "declared_checksum" TEXT,
    "declared_size" BIGINT,
    "dimensions" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "provenance" JSONB NOT NULL DEFAULT '{}',
    "file_name" TEXT,
    "is_derived" BOOLEAN NOT NULL DEFAULT false,
    "parent_asset_id" UUID,
    "variant" TEXT NOT NULL DEFAULT 'original',
    "classification" TEXT NOT NULL DEFAULT 'internal',
    "project_id" UUID,
    "rejection_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMPTZ(6),
    "retention_until" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assets_organization_id_created_at_idx" ON "assets"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "assets_organization_id_project_id_idx" ON "assets"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "assets_organization_id_status_idx" ON "assets"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "assets_organization_id_display_id_key" ON "assets"("organization_id", "display_id");

-- CreateIndex
CREATE UNIQUE INDEX "assets_bucket_storage_key_key" ON "assets"("bucket", "storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "assets_parent_asset_id_variant_key" ON "assets"("parent_asset_id", "variant");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_parent_asset_id_fkey" FOREIGN KEY ("parent_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (I09): value checks (Prisma cannot express them; they do not cause drift).
ALTER TABLE "assets" ADD CONSTRAINT "assets_status_check" CHECK ("status" IN ('pending_upload', 'quarantined', 'ready', 'rejected'));
ALTER TABLE "assets" ADD CONSTRAINT "assets_variant_check" CHECK ("variant" IN ('original', 'thumb_256', 'preview_1024'));
ALTER TABLE "assets" ADD CONSTRAINT "assets_asset_type_check" CHECK ("asset_type" IN ('source_image', 'sketch', 'fabric_image', 'artwork', 'document', 'generated_image', 'svg', 'texture', 'model_3d', 'export', 'mask'));
ALTER TABLE "assets" ADD CONSTRAINT "assets_derived_has_parent_check" CHECK ("is_derived" = ("parent_asset_id" IS NOT NULL));
ALTER TABLE "assets" ADD CONSTRAINT "assets_key_in_org_prefix_check" CHECK ("storage_key" LIKE 'org/' || "organization_id"::text || '/%');
