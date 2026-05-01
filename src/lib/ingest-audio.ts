import { transcribeAudio } from "@/lib/audio-transcriber";
import { chunkText } from "@/lib/chunk-text";
import { embedTextChunks } from "@/lib/embeddings";
import { failIngest } from "@/lib/ingest-fail";
import { applyLinkContentEmbeddings } from "@/lib/ingest-link-content-embeddings";
import { logIngestFailure, logIngestStart } from "@/lib/ingest-logger";
import { buildMetadataText } from "@/lib/metadata-chunk";
import { notifyLinksAfterIngest } from "@/lib/notify-links-after-ingest";
import prisma from "@/lib/prisma";

type IngestAudioInput = {
  linkId: string;
  url: string;
  userId: string;
};

export async function ingestAudio({
  linkId,
  url,
  userId,
}: IngestAudioInput): Promise<void> {
  void userId;
  try {
    await prisma.link.update({
      where: { id: linkId },
      data: { ingestStatus: "PROCESSING", ingestFailureReason: null },
    });
    logIngestStart("AUDIO", linkId, url);

    const transcript = await transcribeAudio(url);
    const contentChunks = chunkText(transcript);

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
    logIngestFailure("AUDIO", linkId, url, error);
    throw error;
  }
}
