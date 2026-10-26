-- CreateTable
CREATE TABLE "artifacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "owner_scope" TEXT NOT NULL,
    "owner_user_id" UUID,
    "display_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "artifact_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "current_revision_id" UUID,
    "revision_counter" INTEGER NOT NULL DEFAULT 0,
    "lifecycle_status" TEXT NOT NULL DEFAULT 'active',
    "derived_from_artifact_revision_id" UUID,
    "platform_key" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifact_revisions" (
    "id" UUID NOT NULL,
    "artifact_id" UUID NOT NULL,
    "organization_id" UUID,
    "display_id" TEXT NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "parent_revision_id" UUID,
    "definition" JSONB NOT NULL,
    "properties" JSONB NOT NULL,
    "preview_asset_id" UUID,
    "geometry_capability" TEXT NOT NULL,
    "validation_status" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "change_note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifact_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_platform_key_key" ON "artifacts"("platform_key");

-- CreateIndex
CREATE INDEX "artifacts_current_revision_id_idx" ON "artifacts"("current_revision_id");

-- CreateIndex
CREATE INDEX "artifacts_organization_id_category_lifecycle_status_idx" ON "artifacts"("organization_id", "category", "lifecycle_status");

-- CreateIndex
CREATE INDEX "artifacts_owner_scope_category_idx" ON "artifacts"("owner_scope", "category");

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_organization_id_display_id_key" ON "artifacts"("organization_id", "display_id");

-- CreateIndex
CREATE INDEX "artifact_revisions_organization_id_idx" ON "artifact_revisions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "artifact_revisions_artifact_id_revision_number_key" ON "artifact_revisions"("artifact_id", "revision_number");

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_current_revision_id_fkey" FOREIGN KEY ("current_revision_id") REFERENCES "artifact_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revisions_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (I13): value checks (Prisma cannot express them; they do not cause drift).
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_owner_scope_check" CHECK ("owner_scope" IN ('platform', 'organization', 'user'));
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_scope_owner_check" CHECK (
  ("owner_scope" = 'platform' AND "organization_id" IS NULL AND "owner_user_id" IS NULL)
  OR ("owner_scope" = 'organization' AND "organization_id" IS NOT NULL)
  OR ("owner_scope" = 'user' AND "organization_id" IS NOT NULL AND "owner_user_id" IS NOT NULL)
);
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_category_check" CHECK ("category" IN ('sleeve', 'collar', 'cuff', 'pocket', 'placket', 'neckline', 'fabric', 'lace', 'trim', 'embroidery', 'button', 'artwork'));
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_lifecycle_status_check" CHECK ("lifecycle_status" IN ('active', 'deprecated', 'deactivated', 'deleted'));
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_deleted_at_check" CHECK (("lifecycle_status" = 'deleted') = ("deleted_at" IS NOT NULL));
ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revisions_revision_number_check" CHECK ("revision_number" >= 1);
ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revisions_geometry_capability_check" CHECK ("geometry_capability" IN ('G0', 'G1', 'G2'));
ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revisions_validation_status_check" CHECK ("validation_status" IN ('unvalidated', 'design_asset_validated', 'production_validated'));

-- Hand-written (I13, ART-002): artifact revisions are immutable, like design revisions.
CREATE OR REPLACE FUNCTION artifact_revisions_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.allow_revision_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'artifact revisions are immutable (% on %)', TG_OP, OLD.id
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "artifact_revisions_immutable"
  BEFORE UPDATE OR DELETE ON "artifact_revisions"
  FOR EACH ROW EXECUTE FUNCTION artifact_revisions_immutable();
