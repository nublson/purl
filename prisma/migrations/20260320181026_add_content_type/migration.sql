-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('WEB', 'YOUTUBE');

-- AlterTable
ALTER TABLE "links" ADD COLUMN     "contentType" "ContentType" NOT NULL DEFAULT 'WEB';
