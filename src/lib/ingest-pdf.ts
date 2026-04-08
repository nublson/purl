import prisma, { Prisma } from "@/lib/prisma";
import { chunkText } from "@/lib/chunk-text";
import { embedTextChunks } from "@/lib/embeddings";
import { logIngestFailure, logIngestStart } from "@/lib/ingest-logger";
import { notifyLinksAfterIngest } from "@/lib/notify-links-after-ingest";
import { buildMetadataText } from "@/lib/metadata-chunk";
import { extractPdfTextByPage } from "@/lib/pdf-extractor";

type IngestPdfInput = {
  linkId: string;
  url: string;
};

export async function ingestPdf({ linkId, url }: IngestPdfInput): Promise<void> {
  try {
    await prisma.link.update({
      where: { id: linkId },
      data: { ingestStatus: "PROCESSING" },
    });
    logIngestStart("PDF", linkId, url);

    const pages = await extractPdfTextByPage(url);
    const contentChunks = chunkText(pages.join("\n\n"));

    const link = await prisma.link.findUnique({
      where: { id: linkId },
      select: {
        title: true,
        url: true,
        domain: true,
        contentType: true,
        description: true,
      },
    });
    if (!link) {
      await prisma.link.update({
        where: { id: linkId },
        data: { ingestStatus: "FAILED" },
      });
      await notifyLinksAfterIngest(linkId);
      throw new Error(`Link not found for ingest: ${linkId}`);
    }

    const metadataChunk = buildMetadataText(link);
    const chunks = [metadataChunk, ...contentChunks];

    await prisma.linkContent.deleteMany({
      where: { linkId },
    });

    const embeddings = await embedTextChunks(chunks);

    await prisma.linkContent.createMany({
      data: chunks.map((content, index) => ({
        linkId,
        content,
        chunkIndex: index,
      })),
    });

    const contentRows = await prisma.linkContent.findMany({
      where: { linkId },
      orderBy: { chunkIndex: "asc" },
      select: { id: true, chunkIndex: true },
    });

    for (const row of contentRows) {
      const vector = embeddings[row.chunkIndex];
      if (!vector) continue;

      await prisma.$executeRaw(
        Prisma.sql`UPDATE "link_contents" SET "embedding" = ${JSON.stringify(vector)}::vector WHERE "id" = ${row.id}`,
      );
    }

    await prisma.link.update({
      where: { id: linkId },
      data: { ingestStatus: "COMPLETED" },
    });
    await notifyLinksAfterIngest(linkId);
  } catch (error) {
    await prisma.link.update({
      where: { id: linkId },
      data: { ingestStatus: "FAILED" },
    });
    await notifyLinksAfterIngest(linkId);
    logIngestFailure("PDF", linkId, url, error);
    throw error;
  }
}
