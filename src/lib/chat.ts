import "server-only";

import { getChatModel } from "@/lib/ai";
import { buildChatSystemPrompt, type RagContextChunk } from "@/lib/chat-prompt";
import prisma from "@/lib/prisma";
import { semanticSearch } from "@/lib/semantic-search";
import { streamText, type ModelMessage } from "ai";

const MAX_CONTEXT_CHARS = 28_000;

function trimToBudget(
  chunks: RagContextChunk[],
  maxChars: number,
): RagContextChunk[] {
  const out: RagContextChunk[] = [];
  let used = 0;
  for (const chunk of chunks) {
    const next = used + chunk.content.length + 64;
    if (next > maxChars) break;
    out.push(chunk);
    used = next;
  }
  return out;
}

export async function fetchChunksForLinkIds(
  userId: string,
  linkIds: string[],
): Promise<RagContextChunk[]> {
  const unique = [...new Set(linkIds)].filter(Boolean);
  if (unique.length === 0) return [];

  const rows = await prisma.linkContent.findMany({
    where: {
      linkId: { in: unique },
      link: { userId },
    },
    orderBy: [{ linkId: "asc" }, { chunkIndex: "asc" }],
    include: {
      link: { select: { id: true, title: true, url: true } },
    },
  });

  return rows.map((row) => ({
    linkId: row.link.id,
    linkTitle: row.link.title,
    linkUrl: row.link.url,
    chunkIndex: row.chunkIndex,
    content: row.content,
  }));
}

export async function buildRagContextForChat(options: {
  userId: string;
  mentionedLinkIds: string[];
  searchQuery: string;
}): Promise<RagContextChunk[]> {
  const { userId, mentionedLinkIds, searchQuery } = options;
  const mentionIds = [...new Set(mentionedLinkIds)].filter(Boolean);

  if (mentionIds.length > 0) {
    const chunks = await fetchChunksForLinkIds(userId, mentionIds);
    return trimToBudget(chunks, MAX_CONTEXT_CHARS);
  }

  const q = searchQuery.trim();
  if (q.length < 3) {
    return [];
  }

  const results = await semanticSearch(q, userId, { matchCount: 15 });
  const linkIds = results.map((r) => r.linkId);
  const chunks = await fetchChunksForLinkIds(userId, linkIds);
  return trimToBudget(chunks, MAX_CONTEXT_CHARS);
}

export async function streamChatForUser(options: {
  messages: ModelMessage[];
  userId: string;
  mentionedLinkIds: string[];
  searchQuery: string;
}) {
  const { messages, userId, mentionedLinkIds, searchQuery } = options;

  const chunks = await buildRagContextForChat({
    userId,
    mentionedLinkIds,
    searchQuery,
  });
  const system = buildChatSystemPrompt(chunks);

  return streamText({
    model: getChatModel(),
    system,
    messages,
  });
}
