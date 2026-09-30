-- AlterTable
ALTER TABLE "links" ADD COLUMN     "folderId" TEXT;

-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "folders_userId_createdAt_idx" ON "folders"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "folders_userId_name_key" ON "folders"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "folders_userId_slug_key" ON "folders"("userId", "slug");

-- CreateIndex
CREATE INDEX "links_userId_folderId_createdAt_idx" ON "links"("userId", "folderId", "createdAt");

-- AddForeignKey
ALTER TABLE "links" ADD CONSTRAINT "links_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
