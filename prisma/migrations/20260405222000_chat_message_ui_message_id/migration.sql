-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN "uiMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_chatId_uiMessageId_key" ON "chat_messages"("chatId", "uiMessageId");
