-- AlterTable
ALTER TABLE "ai_usage_records" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "error_kind" TEXT,
ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "operation" TEXT,
ADD COLUMN     "subject_id" UUID,
ADD COLUMN     "subject_type" TEXT;

-- CreateTable
CREATE TABLE "ai_provider_connections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "encrypted_key" TEXT NOT NULL,
    "key_hint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "last_error" TEXT,
    "models" JSONB NOT NULL DEFAULT '[]',
    "checked_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_provider_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_settings" (
    "organization_id" UUID NOT NULL,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "cross_provider_fallback" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_connections_organization_id_provider_key" ON "ai_provider_connections"("organization_id", "provider");

-- CreateIndex
CREATE INDEX "ai_usage_records_organization_id_provider_model_created_at_idx" ON "ai_usage_records"("organization_id", "provider", "model", "created_at");

-- AddForeignKey
ALTER TABLE "ai_provider_connections" ADD CONSTRAINT "ai_provider_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
