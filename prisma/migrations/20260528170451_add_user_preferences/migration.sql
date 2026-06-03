-- AlterTable
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "preferences" JSONB;
