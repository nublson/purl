-- CreateTable
CREATE TABLE "link_contents" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkId" TEXT NOT NULL,

    CONSTRAINT "link_contents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "link_contents_linkId_key" ON "link_contents"("linkId");

-- AddForeignKey
ALTER TABLE "link_contents" ADD CONSTRAINT "link_contents_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
