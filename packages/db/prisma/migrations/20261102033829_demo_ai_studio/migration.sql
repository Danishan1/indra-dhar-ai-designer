-- CreateTable
CREATE TABLE "design_analyses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "display_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stage" TEXT,
    "inputs" JSONB NOT NULL,
    "notes" TEXT,
    "garment_hint" TEXT,
    "audience" TEXT,
    "provider" TEXT NOT NULL,
    "job_id" UUID,
    "result" JSONB,
    "crops" JSONB NOT NULL DEFAULT '{}',
    "error" JSONB,
    "design_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "design_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tech_packs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "design_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "display_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stage" TEXT,
    "provider" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '{}',
    "job_id" UUID,
    "document" JSONB,
    "pdf_asset_id" UUID,
    "error" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "tech_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "job_id" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "images" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "design_analyses_organization_id_project_id_created_at_idx" ON "design_analyses"("organization_id", "project_id", "created_at");

-- CreateIndex
CREATE INDEX "design_analyses_project_id_idx" ON "design_analyses"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "design_analyses_organization_id_display_id_key" ON "design_analyses"("organization_id", "display_id");

-- CreateIndex
CREATE INDEX "tech_packs_organization_id_design_id_created_at_idx" ON "tech_packs"("organization_id", "design_id", "created_at");

-- CreateIndex
CREATE INDEX "tech_packs_design_id_idx" ON "tech_packs"("design_id");

-- CreateIndex
CREATE INDEX "tech_packs_revision_id_idx" ON "tech_packs"("revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "tech_packs_organization_id_display_id_key" ON "tech_packs"("organization_id", "display_id");

-- CreateIndex
CREATE INDEX "ai_usage_records_organization_id_created_at_idx" ON "ai_usage_records"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "design_analyses" ADD CONSTRAINT "design_analyses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_analyses" ADD CONSTRAINT "design_analyses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tech_packs" ADD CONSTRAINT "tech_packs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tech_packs" ADD CONSTRAINT "tech_packs_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "designs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tech_packs" ADD CONSTRAINT "tech_packs_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "design_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Component library categories made by the AI analyzer (ADR-056).
ALTER TABLE "artifacts" DROP CONSTRAINT "artifacts_category_check";
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_category_check" CHECK ("category" IN ('sleeve', 'collar', 'cuff', 'pocket', 'placket', 'neckline', 'fabric', 'lace', 'trim', 'embroidery', 'button', 'artwork', 'body_panel', 'collar_stand', 'yoke', 'waistband', 'skirt_panel', 'leg_panel', 'hood', 'component'));
