-- AlterEnum
ALTER TYPE "ContentType" ADD VALUE 'IMAGE';
ALTER TYPE "ContentType" ADD VALUE 'VIDEO';

-- AlterTable
ALTER TABLE "links" ADD COLUMN "fileKey" TEXT,
ADD COLUMN "fileSize" INTEGER,
ADD COLUMN "mimeType" TEXT,
ADD COLUMN "width" INTEGER,
ADD COLUMN "height" INTEGER,
ADD COLUMN "duration" INTEGER,
ADD COLUMN "frameable" BOOLEAN,
ADD COLUMN "embed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "links_userId_fileKey_idx" ON "links"("userId", "fileKey");
