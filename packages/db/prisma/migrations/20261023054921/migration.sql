-- DropForeignKey
ALTER TABLE "resource_grants" DROP CONSTRAINT "resource_grants_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "roles" DROP CONSTRAINT "roles_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "security_policies" DROP CONSTRAINT "security_policies_organization_id_fkey";
