-- DropIndex
DROP INDEX "roles_key_key";

-- AlterTable
ALTER TABLE "membership_roles" ADD COLUMN     "scope_id" UUID;

-- AlterTable
ALTER TABLE "roles" DROP COLUMN "rank",
ADD COLUMN     "assignable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "organization_id" UUID,
ADD COLUMN     "scope_type" TEXT NOT NULL DEFAULT 'organization',
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "permissions" (
    "key" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "is_platform" BOOLEAN NOT NULL DEFAULT false,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_key" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_key")
);

-- CreateTable
CREATE TABLE "resource_grants" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID NOT NULL,
    "recipient_type" TEXT NOT NULL,
    "recipient_id" UUID NOT NULL,
    "actions" TEXT[],
    "granted_by" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_permissions_permission_key_idx" ON "role_permissions"("permission_key");

-- CreateIndex
CREATE INDEX "resource_grants_organization_id_recipient_type_recipient_id_idx" ON "resource_grants"("organization_id", "recipient_type", "recipient_id");

-- CreateIndex
CREATE INDEX "resource_grants_resource_type_resource_id_idx" ON "resource_grants"("resource_type", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "security_policies_organization_id_version_key" ON "security_policies"("organization_id", "version");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written (I07)
-- ---------------------------------------------------------------------------------------------

-- Role keys: unique among system roles, and per organization for custom roles.
CREATE UNIQUE INDEX "roles_system_key_unique" ON "roles"("key") WHERE "organization_id" IS NULL;
CREATE UNIQUE INDEX "roles_org_key_unique" ON "roles"("organization_id", "key") WHERE "organization_id" IS NOT NULL;
ALTER TABLE "roles" ADD CONSTRAINT "roles_scope_type_check" CHECK ("scope_type" IN ('organization', 'workspace'));
ALTER TABLE "roles" ADD CONSTRAINT "roles_system_has_no_org_check" CHECK (NOT "is_system" OR "organization_id" IS NULL);
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "resource_grants" ADD CONSTRAINT "resource_grants_recipient_type_check" CHECK ("recipient_type" IN ('user', 'external'));
ALTER TABLE "resource_grants" ADD CONSTRAINT "resource_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "security_policies" ADD CONSTRAINT "security_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Default security policy (version 1) for organizations created before I07.
INSERT INTO "security_policies" ("id", "organization_id", "version", "config", "created_at")
SELECT gen_random_uuid(), o."id", 1, '{}'::jsonb, CURRENT_TIMESTAMP FROM "organizations" o
ON CONFLICT DO NOTHING;
