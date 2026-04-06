import { streamText, type ModelMessage } from "ai";
import { getChatModel } from "@/lib/ai";
import prisma from "@/lib/prisma";
import { semanticSearch } from "@/lib/semantic-search";

const SYSTEM_PROMPT = `You are Purl AI, a knowledgeable assistant that helps users recall and understand content they've saved. You answer questions based on the user's saved links — web pages, PDFs, audio transcriptions, and YouTube videos.

When context from saved content is provided, use it to answer accurately and cite relevant sources. If no relevant context is available, let the user know you couldn't find matching content in their saved items.

Be concise, helpful, and conversational.`;

export async function buildChatContext(
  userId: string,
  query: string,
  mentionedLinkIds?: string[],
): Promise<string | null> {
  let chunks: { content: string; linkTitle: string; linkUrl: string }[] = [];

  if (mentionedLinkIds && mentionedLinkIds.length > 0) {
    const linkContents = await prisma.linkContent.findMany({
      where: { linkId: { in: mentionedLinkIds } },
      orderBy: [{ linkId: "asc" }, { chunkIndex: "asc" }],
      select: {
        content: true,
        link: { select: { title: true, url: true } },
      },
    });

    chunks = linkContents.map((c) => ({
      content: c.content,
      linkTitle: c.link.title,
      linkUrl: c.link.url,
    }));
  } else {
    const results = await semanticSearch(query, userId, { matchCount: 10 });
    if (results.length === 0) return null;

    const linkIds = [...new Set(results.map((r) => r.linkId))];
    const linkContents = await prisma.linkContent.findMany({
      where: { linkId: { in: linkIds } },
      orderBy: [{ linkId: "asc" }, { chunkIndex: "asc" }],
      select: {
        content: true,
        link: { select: { title: true, url: true } },
      },
    });

    chunks = linkContents.map((c) => ({
      content: c.content,
      linkTitle: c.link.title,
      linkUrl: c.link.url,
    }));
  }

  if (chunks.length === 0) return null;

  const grouped = new Map<string, { url: string; texts: string[] }>();
  for (const chunk of chunks) {
    const existing = grouped.get(chunk.linkTitle);
    if (existing) {
      existing.texts.push(chunk.content);
    } else {
      grouped.set(chunk.linkTitle, {
        url: chunk.linkUrl,
        texts: [chunk.content],
      });
    }
  }

  const sections = Array.from(grouped.entries()).map(
    ([title, { url, texts }]) =>
      `### ${title}\nSource: ${url}\n\n${texts.join("\n\n")}`,
  );

  return sections.join("\n\n---\n\n");
}

export function streamChatResponse(
  messages: ModelMessage[],
  context: string | null,
  onFinish?: (text: string) => void | Promise<void>,
) {
  const systemContent = context
    ? `${SYSTEM_PROMPT}\n\n## Relevant saved content\n\n${context}`
    : SYSTEM_PROMPT;

  return streamText({
    model: getChatModel(),
    system: systemContent,
    messages,
    onFinish: async ({ text }) => {
      if (onFinish) await onFinish(text);
    },
  });
}
