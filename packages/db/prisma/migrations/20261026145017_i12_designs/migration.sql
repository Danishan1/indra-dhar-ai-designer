-- CreateTable
CREATE TABLE "designs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "display_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "garment_type" TEXT NOT NULL,
    "garment_category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "head_revision_id" UUID,
    "approved_revision_id" UUID,
    "revision_counter" INTEGER NOT NULL DEFAULT 0,
    "duplicated_from_design_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "designs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "working_copies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "design_id" UUID NOT NULL,
    "base_revision_id" UUID,
    "restored_from_revision_id" UUID,
    "state" JSONB NOT NULL,
    "schema_version" TEXT NOT NULL,
    "semantic_hash" TEXT NOT NULL,
    "has_uncommitted_changes" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "last_modified_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "working_copies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_revisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "design_id" UUID NOT NULL,
    "display_id" TEXT NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "branch_id" UUID,
    "parent_revision_ids" UUID[],
    "restored_from_revision_id" UUID,
    "snapshot" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "semantic_hash" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "artifact_revision_refs" TEXT[],
    "source_asset_refs" TEXT[],
    "change_summary" TEXT NOT NULL,
    "change_diff_summary" JSONB NOT NULL,
    "validation_summary" JSONB NOT NULL,
    "operation_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "designs_organization_id_project_id_updated_at_idx" ON "designs"("organization_id", "project_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "designs_organization_id_display_id_key" ON "designs"("organization_id", "display_id");

-- CreateIndex
CREATE UNIQUE INDEX "working_copies_design_id_key" ON "working_copies"("design_id");

-- CreateIndex
CREATE INDEX "working_copies_organization_id_idx" ON "working_copies"("organization_id");

-- CreateIndex
CREATE INDEX "working_copies_base_revision_id_idx" ON "working_copies"("base_revision_id");

-- CreateIndex
CREATE INDEX "design_revisions_organization_id_idx" ON "design_revisions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "design_revisions_design_id_revision_number_key" ON "design_revisions"("design_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "design_revisions_organization_id_display_id_key" ON "design_revisions"("organization_id", "display_id");

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "working_copies" ADD CONSTRAINT "working_copies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "working_copies" ADD CONSTRAINT "working_copies_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "designs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "working_copies" ADD CONSTRAINT "working_copies_base_revision_id_fkey" FOREIGN KEY ("base_revision_id") REFERENCES "design_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_revisions" ADD CONSTRAINT "design_revisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_revisions" ADD CONSTRAINT "design_revisions_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "designs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (I12): value checks (Prisma cannot express them; they do not cause drift).
ALTER TABLE "designs" ADD CONSTRAINT "designs_status_check" CHECK ("status" IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED'));
ALTER TABLE "designs" ADD CONSTRAINT "designs_revision_counter_check" CHECK ("revision_counter" >= 0);
ALTER TABLE "working_copies" ADD CONSTRAINT "working_copies_version_check" CHECK ("version" >= 1);
ALTER TABLE "design_revisions" ADD CONSTRAINT "design_revisions_revision_number_check" CHECK ("revision_number" >= 1);
ALTER TABLE "design_revisions" ADD CONSTRAINT "design_revisions_content_hash_check" CHECK ("content_hash" ~ '^sha256:[0-9a-f]{64}$');

-- Hand-written (I12, ADR-003, DSN-008, FR-PRJ-026): committed revisions are immutable.
-- Every UPDATE is rejected. DELETE is rejected unless the session explicitly enables the
-- retention purge (`SET LOCAL app.allow_revision_purge = 'on'`, used only by erasure in I47).
-- TRUNCATE (test resets) does not fire row triggers.
CREATE OR REPLACE FUNCTION design_revisions_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.allow_revision_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'design revisions are immutable (% on %)', TG_OP, OLD.id
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "design_revisions_immutable"
  BEFORE UPDATE OR DELETE ON "design_revisions"
  FOR EACH ROW EXECUTE FUNCTION design_revisions_immutable();
