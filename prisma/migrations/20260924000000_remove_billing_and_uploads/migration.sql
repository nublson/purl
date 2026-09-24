-- Remove paid plans (Stripe) and file uploads.
-- Irreversible: subscription/purchase records and processed Stripe event ids are deleted.
-- Stripe keeps its own payment history. Uploaded objects in the user-uploads bucket are not touched.

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_userId_fkey";

-- AlterTable
ALTER TABLE "links" DROP COLUMN "storagePath";

-- DropTable
DROP TABLE "subscriptions";

-- DropTable
DROP TABLE "processed_stripe_events";

-- DropEnum
DROP TYPE "PlanKey";

-- DropEnum
DROP TYPE "SubStatus";

