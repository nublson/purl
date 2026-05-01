-- Remap legacy failure reason before shrinking the enum
UPDATE "links"
SET "ingestFailureReason" = 'OTHER'::"IngestFailureReason"
WHERE "ingestFailureReason"::text = 'NO_API_KEY';

-- Drop per-user encrypted API keys (BYOK removed)
DROP TABLE IF EXISTS "user_api_keys";

-- PostgreSQL: replace enum without NO_API_KEY
CREATE TYPE "IngestFailureReason_new" AS ENUM ('SCRAPE_FAILED', 'LINK_NOT_FOUND', 'OTHER');

ALTER TABLE "links"
ALTER COLUMN "ingestFailureReason" TYPE "IngestFailureReason_new"
USING ("ingestFailureReason"::text::"IngestFailureReason_new");

DROP TYPE "IngestFailureReason";
ALTER TYPE "IngestFailureReason_new" RENAME TO "IngestFailureReason";
