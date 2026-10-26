-- CreateTable
CREATE TABLE "design_operations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "design_id" UUID NOT NULL,
    "display_id" TEXT NOT NULL,
    "operation_type" TEXT NOT NULL,
    "operation_schema_version" TEXT NOT NULL,
    "base_revision_id" UUID,
    "base_working_copy_version" INTEGER NOT NULL,
    "result_working_copy_version" INTEGER,
    "result_revision_id" UUID,
    "job_id" UUID,
    "target_entities" JSONB NOT NULL,
    "requested_changes" JSONB NOT NULL,
    "preservation_constraints" JSONB NOT NULL,
    "source_refs" JSONB NOT NULL,
    "execution_policy" JSONB NOT NULL,
    "execution_strategy" TEXT NOT NULL,
    "strategy_rationale" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "findings" JSONB NOT NULL DEFAULT '[]',
    "inverse" JSONB,
    "result_entity_hashes" JSONB,
    "reverts_operation_id" UUID,
    "reverted_by_operation_id" UUID,
    "idempotency_key" TEXT,
    "requested_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "design_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "design_operations_organization_id_idempotency_key_idx" ON "design_operations"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "design_operations_organization_id_design_id_created_at_idx" ON "design_operations"("organization_id", "design_id", "created_at");

-- CreateIndex
CREATE INDEX "design_operations_design_id_result_revision_id_idx" ON "design_operations"("design_id", "result_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "design_operations_organization_id_display_id_key" ON "design_operations"("organization_id", "display_id");

-- AddForeignKey
ALTER TABLE "design_operations" ADD CONSTRAINT "design_operations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_operations" ADD CONSTRAINT "design_operations_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "designs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (I14): value checks (Prisma cannot express them; they do not cause drift).
ALTER TABLE "design_operations" ADD CONSTRAINT "design_operations_status_check" CHECK ("status" IN ('requested', 'running', 'completed', 'failed', 'cancelled', 'reverted'));
ALTER TABLE "design_operations" ADD CONSTRAINT "design_operations_versions_check" CHECK ("base_working_copy_version" >= 1 AND ("result_working_copy_version" IS NULL OR "result_working_copy_version" > "base_working_copy_version"));
