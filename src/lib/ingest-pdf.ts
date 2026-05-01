import { chunkText } from "@/lib/chunk-text";
import { embedTextChunks } from "@/lib/embeddings";
import { failIngest } from "@/lib/ingest-fail";
import { applyLinkContentEmbeddings } from "@/lib/ingest-link-content-embeddings";
import { logIngestFailure, logIngestStart } from "@/lib/ingest-logger";
import { buildMetadataText } from "@/lib/metadata-chunk";
import { notifyLinksAfterIngest } from "@/lib/notify-links-after-ingest";
import { extractPdfTextByPage } from "@/lib/pdf-extractor";
import prisma from "@/lib/prisma";

type IngestPdfInput = {
  linkId: string;
  url: string;
  userId: string;
};

export async function ingestPdf({
  linkId,
  url,
  userId,
}: IngestPdfInput): Promise<void> {
  void userId;
  try {
    await prisma.link.update({
      where: { id: linkId },
      data: { ingestStatus: "PROCESSING", ingestFailureReason: null },
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
      await failIngest(linkId, "LINK_NOT_FOUND");
      return;
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

    await applyLinkContentEmbeddings(contentRows, embeddings);

    await prisma.link.update({
      where: { id: linkId },
      data: { ingestStatus: "COMPLETED" },
    });
    await notifyLinksAfterIngest(linkId);
  } catch (error) {
    await failIngest(linkId, "SCRAPE_FAILED");
    logIngestFailure("PDF", linkId, url, error);
    throw error;
  }
}
