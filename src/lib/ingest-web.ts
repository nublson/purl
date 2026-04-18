import { chunkText } from "@/lib/chunk-text";
import { embedTextChunks } from "@/lib/embeddings";
import { applyLinkContentEmbeddings } from "@/lib/ingest-link-content-embeddings";
import { logIngestFailure, logIngestStart } from "@/lib/ingest-logger";
import { skipIngest } from "@/lib/ingest-skip";
import { buildMetadataText } from "@/lib/metadata-chunk";
import { notifyLinksAfterIngest } from "@/lib/notify-links-after-ingest";
import prisma from "@/lib/prisma";
import { scrapeWebContent, UnsupportedSpaError } from "@/lib/web-scraper";
import { getDecryptedApiKey } from "./api-keys";

type IngestWebInput = {
  linkId: string;
  url: string;
  userId: string;
};

export async function ingestWeb({
  linkId,
  url,
  userId,
}: IngestWebInput): Promise<void> {
  try {
    await prisma.link.update({
      where: { id: linkId },
      data: { ingestStatus: "PROCESSING" },
    });
    logIngestStart("WEB", linkId, url);

    const apiKey = await getDecryptedApiKey(userId);

    const text = await scrapeWebContent(url);
    const contentChunks = chunkText(text);

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
    if (error instanceof UnsupportedSpaError) {
      await skipIngest(linkId);
      return;
    }

    await prisma.link.update({
      where: { id: linkId },
      data: { ingestStatus: "FAILED" },
    });
    await notifyLinksAfterIngest(linkId);
    logIngestFailure("WEB", linkId, url, error);
    throw error;
  }
}
