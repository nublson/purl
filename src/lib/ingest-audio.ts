import prisma from "@/lib/prisma";
import { transcribeAudio } from "@/lib/audio-transcriber";
import { chunkText } from "@/lib/chunk-text";
import { embedTextChunks } from "@/lib/embeddings";
import { applyLinkContentEmbeddings } from "@/lib/ingest-link-content-embeddings";
import { logIngestFailure, logIngestStart } from "@/lib/ingest-logger";
import { notifyLinksAfterIngest } from "@/lib/notify-links-after-ingest";
import { buildMetadataText } from "@/lib/metadata-chunk";

type IngestAudioInput = {
  linkId: string;
  url: string;
};

export async function ingestAudio({ linkId, url }: IngestAudioInput): Promise<void> {
  try {
    await prisma.link.update({
      where: { id: linkId },
      data: { ingestStatus: "PROCESSING" },
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
    logIngestFailure("AUDIO", linkId, url, error);
    throw error;
  }
}
