-- AlterTable
ALTER TABLE "tech_packs" ADD COLUMN     "pdf_error" TEXT,
ADD COLUMN     "pdf_status" TEXT NOT NULL DEFAULT 'none';

-- Existing tech packs: a stored PDF is ready; a finished pack without one failed to print.
UPDATE "tech_packs" SET "pdf_status" = 'ready' WHERE "pdf_asset_id" IS NOT NULL;
UPDATE "tech_packs" SET "pdf_status" = 'failed', "pdf_error" = 'The PDF could not be printed when the tech pack was generated' WHERE "pdf_asset_id" IS NULL AND "status" = 'succeeded';
