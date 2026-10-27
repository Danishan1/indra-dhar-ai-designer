-- CreateTable
CREATE TABLE "constraint_sets" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "garment_types" TEXT[],
    "rules" TEXT[],
    "ranges" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "constraint_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "design_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "revision_id" UUID,
    "target_version" INTEGER NOT NULL,
    "state_hash" TEXT NOT NULL,
    "constraint_set_id" UUID NOT NULL,
    "constraint_set_ref" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "counts" JSONB NOT NULL,
    "requested_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_findings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "finding_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "rule_id" TEXT NOT NULL,
    "rule_version" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "path" TEXT,
    "message" TEXT NOT NULL,
    "resolution" TEXT,

    CONSTRAINT "validation_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "constraint_sets_key_version_key" ON "constraint_sets"("key", "version");

-- CreateIndex
CREATE INDEX "validation_runs_organization_id_design_id_target_type_creat_idx" ON "validation_runs"("organization_id", "design_id", "target_type", "created_at");

-- CreateIndex
CREATE INDEX "validation_runs_constraint_set_id_idx" ON "validation_runs"("constraint_set_id");

-- CreateIndex
CREATE INDEX "validation_findings_organization_id_idx" ON "validation_findings"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "validation_findings_run_id_finding_id_key" ON "validation_findings"("run_id", "finding_id");

-- AddForeignKey
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "designs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_constraint_set_id_fkey" FOREIGN KEY ("constraint_set_id") REFERENCES "constraint_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_findings" ADD CONSTRAINT "validation_findings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_findings" ADD CONSTRAINT "validation_findings_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "validation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
