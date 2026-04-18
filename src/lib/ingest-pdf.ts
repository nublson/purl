import { chunkText } from "@/lib/chunk-text";
import { embedTextChunks } from "@/lib/embeddings";
import { applyLinkContentEmbeddings } from "@/lib/ingest-link-content-embeddings";
import { logIngestFailure, logIngestStart } from "@/lib/ingest-logger";
import { buildMetadataText } from "@/lib/metadata-chunk";
import { notifyLinksAfterIngest } from "@/lib/notify-links-after-ingest";
import { extractPdfTextByPage } from "@/lib/pdf-extractor";
import prisma from "@/lib/prisma";
import { getDecryptedApiKey } from "./api-keys";

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
  try {
    await prisma.link.update({
      where: { id: linkId },
      data: { ingestStatus: "PROCESSING" },
    });
    logIngestStart("PDF", linkId, url);

    const apiKey = await getDecryptedApiKey(userId);

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

    const embeddings = await embedTextChunks(chunks, apiKey);

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
    await prisma.link.update({
      where: { id: linkId },
      data: { ingestStatus: "FAILED" },
    });
    await notifyLinksAfterIngest(linkId);
    logIngestFailure("PDF", linkId, url, error);
    throw error;
  }
}
