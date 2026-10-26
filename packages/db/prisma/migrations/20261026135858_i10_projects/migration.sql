-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "display_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "visibility" TEXT NOT NULL DEFAULT 'organization',
    "product_category" TEXT,
    "season" TEXT,
    "brand" TEXT,
    "target_market" TEXT,
    "style_number" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "default_design_id" UUID,
    "status_reason" TEXT,
    "duplicated_from_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_organization_id_status_updated_at_idx" ON "projects"("organization_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "projects_organization_id_created_at_idx" ON "projects"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "projects_organization_id_name_idx" ON "projects"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organization_id_display_id_key" ON "projects"("organization_id", "display_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (I10): value checks (Prisma cannot express them; they do not cause drift).
ALTER TABLE "projects" ADD CONSTRAINT "projects_status_check" CHECK ("status" IN ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED', 'DELETED'));
ALTER TABLE "projects" ADD CONSTRAINT "projects_visibility_check" CHECK ("visibility" IN ('organization', 'restricted'));
ALTER TABLE "projects" ADD CONSTRAINT "projects_version_check" CHECK ("version" >= 1);
ALTER TABLE "projects" ADD CONSTRAINT "projects_deleted_at_check" CHECK (("status" = 'DELETED') = ("deleted_at" IS NOT NULL));
