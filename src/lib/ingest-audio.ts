import prisma, { Prisma } from "@/lib/prisma";
import { transcribeAudio } from "@/lib/audio-transcriber";
import { chunkText } from "@/lib/chunk-text";
import { embedTextChunks } from "@/lib/embeddings";

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

    const transcript = await transcribeAudio(url);
    const chunks = chunkText(transcript);

    await prisma.linkContent.deleteMany({
      where: { linkId },
    });

    if (chunks.length === 0) {
      await prisma.link.update({
        where: { id: linkId },
        data: { ingestStatus: "COMPLETED" },
      });
      return;
    }

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
  } catch (error) {
    await prisma.link.update({
      where: { id: linkId },
      data: { ingestStatus: "FAILED" },
    });
    throw error;
  }
}
