-- AlterTable
ALTER TABLE "links" ADD COLUMN "needsMetadata" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "links_needsMetadata_createdAt_idx" ON "links"("needsMetadata", "createdAt");
