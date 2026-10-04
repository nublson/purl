-- CreateEnum
CREATE TYPE "LinkView" AS ENUM ('LIST', 'GRID');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "linkView" "LinkView" NOT NULL DEFAULT 'LIST';
