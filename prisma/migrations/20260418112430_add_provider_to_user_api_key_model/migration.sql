/*
  Warnings:

  - A unique constraint covering the columns `[userId,provider]` on the table `user_api_keys` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "user_api_keys_userId_key";

-- AlterTable
ALTER TABLE "user_api_keys" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'openai';

-- CreateIndex
CREATE UNIQUE INDEX "user_api_keys_userId_provider_key" ON "user_api_keys"("userId", "provider");
