-- Remove AI ingestion: extracted content + embeddings, ingest status, usage metering.
-- Irreversible: extracted text, embeddings, and usage_events rows are deleted.
-- The pgvector extension is left installed.

-- DropFunction (both overloads of the pgvector search helper over link_contents)
DROP FUNCTION IF EXISTS match_link_chunks(vector, TEXT, INTEGER, TEXT, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS match_link_chunks(vector, TEXT, INTEGER, TEXT);

-- DropForeignKey
ALTER TABLE "link_contents" DROP CONSTRAINT "link_contents_linkId_fkey";

-- AlterTable
ALTER TABLE "links" DROP COLUMN "ingestFailureReason",
DROP COLUMN "ingestStatus";

-- DropTable
DROP TABLE "usage_events";

-- DropTable
DROP TABLE "link_contents";

-- DropEnum
DROP TYPE "IngestStatus";

-- DropEnum
DROP TYPE "IngestFailureReason";

-- DropEnum
DROP TYPE "UsageKind";

