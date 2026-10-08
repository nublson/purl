-- AlterTable
ALTER TABLE "folders" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill: each user's current A–Z order becomes their manual order (from 1).
UPDATE "folders" f SET "position" = r.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY lower("name"), "id") AS rn
  FROM "folders"
) r
WHERE f."id" = r."id";

-- CreateIndex
CREATE INDEX "folders_userId_position_idx" ON "folders"("userId", "position");
