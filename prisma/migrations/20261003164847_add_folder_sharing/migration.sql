-- AlterTable
ALTER TABLE "folders" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "folder_slug_redirects" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folder_slug_redirects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "username_redirects" (
    "username" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "username_redirects_pkey" PRIMARY KEY ("username")
);

-- CreateIndex
CREATE INDEX "folder_slug_redirects_folderId_idx" ON "folder_slug_redirects"("folderId");

-- CreateIndex
CREATE UNIQUE INDEX "folder_slug_redirects_userId_slug_key" ON "folder_slug_redirects"("userId", "slug");

-- CreateIndex
CREATE INDEX "username_redirects_userId_idx" ON "username_redirects"("userId");

-- AddForeignKey
ALTER TABLE "folder_slug_redirects" ADD CONSTRAINT "folder_slug_redirects_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "username_redirects" ADD CONSTRAINT "username_redirects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
