-- CreateTable
CREATE TABLE "design_looks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "design_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "display_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stage" TEXT,
    "provider" TEXT NOT NULL,
    "style" TEXT NOT NULL DEFAULT 'sketch',
    "note" TEXT,
    "views" JSONB NOT NULL DEFAULT '[]',
    "job_id" UUID,
    "error" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "design_looks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "design_looks_organization_id_design_id_created_at_idx" ON "design_looks"("organization_id", "design_id", "created_at");

-- CreateIndex
CREATE INDEX "design_looks_design_id_idx" ON "design_looks"("design_id");

-- CreateIndex
CREATE INDEX "design_looks_revision_id_idx" ON "design_looks"("revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "design_looks_organization_id_display_id_key" ON "design_looks"("organization_id", "display_id");

-- AddForeignKey
ALTER TABLE "design_looks" ADD CONSTRAINT "design_looks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_looks" ADD CONSTRAINT "design_looks_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "designs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_looks" ADD CONSTRAINT "design_looks_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "design_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
