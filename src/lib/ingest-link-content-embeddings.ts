import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";

/**
 * Writes embedding vectors for rows created during ingest. Called after
 * `embedTextChunks` + `linkContent.createMany` in the four ingest pipelines
 * (web, YouTube, PDF, audio): fetch text → chunk → delete old rows → embed →
 * insert rows → this helper → mark COMPLETED. Steps before this are strictly
 * ordered; this replaces N per-row UPDATEs with batched statements.
 *
 * `link_contents.id` is a cuid string (text), not PostgreSQL uuid — do not cast
 * the id column in VALUES to `::uuid` or joins hit `text = uuid` errors.
 */
export type LinkContentEmbeddingRow = { id: string; chunkIndex: number };

const EMBEDDING_UPDATE_BATCH = 150;

function sqlCommaList(fragments: Prisma.Sql[]): Prisma.Sql {
  if (fragments.length === 0) {
    throw new Error("sqlCommaList: empty fragments");
  }
  let acc = fragments[0]!;
  for (let i = 1; i < fragments.length; i++) {
    acc = Prisma.sql`${acc}, ${fragments[i]!}`;
  }
  return acc;
}

export async function applyLinkContentEmbeddings(
  contentRows: LinkContentEmbeddingRow[],
  embeddings: number[][],
): Promise<void> {
  const valueRows: Prisma.Sql[] = [];
  for (const row of contentRows) {
    const vector = embeddings[row.chunkIndex];
    if (!vector) continue;
    valueRows.push(
      Prisma.sql`(${row.id}, ${JSON.stringify(vector)}::vector)`,
    );
  }

  for (let i = 0; i < valueRows.length; i += EMBEDDING_UPDATE_BATCH) {
    const batch = valueRows.slice(i, i + EMBEDDING_UPDATE_BATCH);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "link_contents" AS lc
      SET "embedding" = v.emb::vector
      FROM (VALUES ${sqlCommaList(batch)}) AS v(id, emb)
      WHERE lc.id = v.id
    `);
  }
}
