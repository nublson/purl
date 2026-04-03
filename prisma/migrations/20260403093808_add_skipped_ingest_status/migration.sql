-- AlterEnum
ALTER TYPE "IngestStatus" ADD VALUE 'SKIPPED';

-- DropIndex
DROP INDEX "link_contents_linkId_chunkIndex_key";

-- DropIndex
DROP INDEX "link_contents_linkId_idx";
