-- Remove AI chat: chat tables, BYOK key, chat preferences, CHAT_MSG usage kind.
-- Irreversible: existing chat history and stored BYOK keys are deleted.

-- Drop CHAT_MSG usage rows so the enum cast below cannot fail.
DELETE FROM "usage_events" WHERE "kind" = 'CHAT_MSG';

-- AlterEnum
BEGIN;
CREATE TYPE "UsageKind_new" AS ENUM ('SAVE', 'EXTRACT');
ALTER TABLE "usage_events" ALTER COLUMN "kind" TYPE "UsageKind_new" USING ("kind"::text::"UsageKind_new");
ALTER TYPE "UsageKind" RENAME TO "UsageKind_old";
ALTER TYPE "UsageKind_new" RENAME TO "UsageKind";
DROP TYPE "UsageKind_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "chats" DROP CONSTRAINT "chats_userId_fkey";

-- DropForeignKey
ALTER TABLE "chat_messages" DROP CONSTRAINT "chat_messages_chatId_fkey";

-- DropForeignKey
ALTER TABLE "_ChatMessageToLink" DROP CONSTRAINT "_ChatMessageToLink_A_fkey";

-- DropForeignKey
ALTER TABLE "_ChatMessageToLink" DROP CONSTRAINT "_ChatMessageToLink_B_fkey";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "anthropicApiKeyEncrypted",
DROP COLUMN "preferences";

-- DropTable
DROP TABLE "chats";

-- DropTable
DROP TABLE "chat_messages";

-- DropTable
DROP TABLE "_ChatMessageToLink";

-- DropEnum
DROP TYPE "MessageRole";

