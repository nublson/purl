-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "IngestStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "links" ADD COLUMN     "ingestStatus" "IngestStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "link_contents" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "chunkIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_contents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "link_contents_linkId_idx" ON "link_contents"("linkId");

-- CreateIndex
CREATE UNIQUE INDEX "link_contents_linkId_chunkIndex_key" ON "link_contents"("linkId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "link_contents" ADD CONSTRAINT "link_contents_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
