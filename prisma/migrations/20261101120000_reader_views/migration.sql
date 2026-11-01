-- CreateEnum
CREATE TYPE "ReaderViewStatus" AS ENUM ('PENDING', 'READY', 'NONE', 'FAILED');

-- CreateTable
CREATE TABLE "reader_views" (
    "linkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ReaderViewStatus" NOT NULL,
    "reason" TEXT,
    "markdown" TEXT,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "bytes" INTEGER,
    "claimedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3),
    "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce("markdown", ''))) STORED,

    CONSTRAINT "reader_views_pkey" PRIMARY KEY ("linkId")
);

-- CreateIndex
CREATE INDEX "reader_views_userId_status_idx" ON "reader_views"("userId", "status");

-- AddForeignKey
ALTER TABLE "reader_views" ADD CONSTRAINT "reader_views_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reader_views" ADD CONSTRAINT "reader_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "reader_views_tsv_idx" ON "reader_views" USING GIN ("tsv");
