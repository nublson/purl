/*
  Warnings:

  - The `ingestFailureReason` column on the `links` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "IngestFailureReason" AS ENUM ('NO_API_KEY', 'SCRAPE_FAILED', 'LINK_NOT_FOUND', 'OTHER');

-- AlterTable
ALTER TABLE "links" DROP COLUMN "ingestFailureReason",
ADD COLUMN     "ingestFailureReason" "IngestFailureReason";
