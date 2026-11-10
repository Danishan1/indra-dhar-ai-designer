-- CreateTable
CREATE TABLE "size_charts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "sizes" JSONB NOT NULL DEFAULT '[]',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "size_charts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "size_charts_organization_id_audience_idx" ON "size_charts"("organization_id", "audience");

-- CreateIndex
CREATE UNIQUE INDEX "size_charts_organization_id_name_key" ON "size_charts"("organization_id", "name");

-- AddForeignKey
ALTER TABLE "size_charts" ADD CONSTRAINT "size_charts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
