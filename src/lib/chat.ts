import {
  streamText,
  tool,
  jsonSchema,
  stepCountIs,
  type ModelMessage,
  type ToolExecutionOptions,
  type UIMessageStreamWriter,
} from "ai";
import * as Sentry from "@sentry/nextjs";
import { getChatModel } from "@/lib/ai";
import { CHAT_ERROR_CODES } from "@/lib/chat-http-errors";
import type {
  ChatStreamErrorPayload,
  PurlChatUIMessage,
} from "@/lib/chat-stream-error";
import prisma from "@/lib/prisma";
import {
  semanticSearch,
  type LinkContentType,
} from "@/lib/semantic-search";

function buildSystemPrompt(context: string | null): string {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const base = `You are Purl AI, a knowledgeable assistant that helps users recall and understand content they've saved. You answer questions based on the user's saved links — web pages, PDFs, audio transcriptions, and YouTube videos.

Today is ${today}.

You have tools to retrieve the user's saved content. Use them proactively:
- Use "listSavedItems" for temporal queries ("this week", "yesterday", "last month"), browsing ("show me my PDFs"), or listing requests ("everything I saved").
- Use "searchContent" for topic-based questions ("what was that article about React?") or when you need the actual content of saved items to answer a question.
- Combine both when the user asks about a topic within a time range ("articles about AI from this week").
- When the user says "read" or "reading", treat it as covering all readable content types — WEB and PDF — not web pages alone. Only filter by contentType when the user explicitly specifies a type.

Always use at least one tool before answering — do not guess or say you lack context without searching first. When citing sources, include the title and URL. Be concise, helpful, and conversational.`;

  if (context) {
    return `${base}\n\n## Content from @mentioned items\n\n${context}`;
  }

  return base;
}

type ListSavedItemsInput = {
  dateFrom?: string;
  dateTo?: string;
  contentType?: string;
  limit?: number;
};

type SearchContentInput = {
  query: string;
  dateFrom?: string;
  dateTo?: string;
  contentType?: string;
  limit?: number;
};

type ChatToolContext = {
  chatId: string;
  userId: string;
  streamWriter?: UIMessageStreamWriter<PurlChatUIMessage>;
};

function emitChatStreamProtocolError(
  writer: UIMessageStreamWriter<PurlChatUIMessage> | undefined,
  payload: ChatStreamErrorPayload,
): void {
  if (!writer) return;
  writer.write({
    type: "data-chat-protocol-error",
    data: payload,
    transient: true,
  });
}

function captureToolError(
  toolName: string,
  err: unknown,
  ctx: ChatToolContext,
): void {
  Sentry.captureException(err, {
    tags: {
      phase: "tool_execute",
      tool: toolName,
      userId: ctx.userId,
      chatId: ctx.chatId,
    },
  });
}

export function buildChatTools(
  userId: string,
  ctx: {
    chatId: string;
    streamWriter?: UIMessageStreamWriter<PurlChatUIMessage>;
  },
) {
  const toolCtx: ChatToolContext = {
    userId,
    chatId: ctx.chatId,
    streamWriter: ctx.streamWriter,
  };

  return {
    listSavedItems: tool({
      description:
        "List the user's saved items with optional filters. Use for temporal queries, browsing by type, or listing recent saves. Returns metadata only (no full content).",
      inputSchema: jsonSchema<ListSavedItemsInput>({
        type: "object",
        properties: {
          dateFrom: {
            type: "string",
            description: "ISO 8601 date string for the start of the date range",
          },
          dateTo: {
            type: "string",
            description: "ISO 8601 date string for the end of the date range",
          },
          contentType: {
            type: "string",
            enum: ["WEB", "YOUTUBE", "PDF", "AUDIO"],
            description: "Filter by content type",
          },
          limit: {
            type: "number",
            description: "Maximum number of items to return (1-50, default 20)",
          },
        },
      }),
      execute: async (
        { dateFrom, dateTo, contentType, limit }: ListSavedItemsInput,
        options: ToolExecutionOptions,
      ) => {
        void options;
        try {
          const where: Record<string, unknown> = { userId };

          if (contentType) {
            where.contentType = contentType;
          }

          const createdAt: Record<string, Date> = {};
          if (dateFrom) createdAt.gte = new Date(dateFrom);
          if (dateTo) createdAt.lte = new Date(dateTo);
          if (Object.keys(createdAt).length > 0) {
            where.createdAt = createdAt;
          }

          const take = Math.max(1, Math.min(limit ?? 20, 50));

          const links = await prisma.link.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take,
            select: {
              id: true,
              title: true,
              url: true,
              domain: true,
              contentType: true,
              description: true,
              createdAt: true,
            },
          });

          return links.map((l) => ({
            title: l.title,
            url: l.url,
            domain: l.domain,
            contentType: l.contentType,
            description: l.description,
            savedAt: l.createdAt.toISOString(),
          }));
        } catch (err) {
          captureToolError("listSavedItems", err, toolCtx);
          emitChatStreamProtocolError(toolCtx.streamWriter, {
            code: CHAT_ERROR_CODES.TOOL_FAILED,
            userMessage:
              "Something went wrong while loading your saved items. Please try again.",
            tool: "listSavedItems",
          });
          throw err;
        }
      },
    }),

    searchContent: tool({
      description:
        "Semantic search across the user's saved content. Use for topic-based questions or when you need actual content to answer. Supports optional date and type filters.",
      inputSchema: jsonSchema<SearchContentInput>({
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query describing the topic",
          },
          dateFrom: {
            type: "string",
            description: "ISO 8601 date string for the start of the date range",
          },
          dateTo: {
            type: "string",
            description: "ISO 8601 date string for the end of the date range",
          },
          contentType: {
            type: "string",
            enum: ["WEB", "YOUTUBE", "PDF", "AUDIO"],
            description: "Filter by content type",
          },
          limit: {
            type: "number",
            description: "Maximum number of items to return (1-20, default 10)",
          },
        },
        required: ["query"],
      }),
      execute: async (
        { query, dateFrom, dateTo, contentType, limit }: SearchContentInput,
        options: ToolExecutionOptions,
      ) => {
        void options;
        try {
          const results = await semanticSearch(query, userId, {
            matchCount: Math.max(1, Math.min(limit ?? 10, 20)),
            type: contentType as LinkContentType | undefined,
            dateFrom: dateFrom ? new Date(dateFrom) : undefined,
            dateTo: dateTo ? new Date(dateTo) : undefined,
          });

          if (results.length === 0) return [];

          const linkIds = [...new Set(results.map((r) => r.linkId))];
          const linkContents = await prisma.linkContent.findMany({
            where: { linkId: { in: linkIds } },
            orderBy: [{ linkId: "asc" }, { chunkIndex: "asc" }],
            select: {
              content: true,
              link: {
                select: {
                  title: true,
                  url: true,
                  contentType: true,
                  createdAt: true,
                },
              },
            },
          });

          const grouped = new Map<
            string,
            { url: string; contentType: string; savedAt: string; texts: string[] }
          >();
          for (const c of linkContents) {
            const existing = grouped.get(c.link.title);
            if (existing) {
              existing.texts.push(c.content);
            } else {
              grouped.set(c.link.title, {
                url: c.link.url,
                contentType: c.link.contentType,
                savedAt: c.link.createdAt.toISOString(),
                texts: [c.content],
              });
            }
          }

          return Array.from(grouped.entries()).map(
            ([title, { url, contentType: type, savedAt, texts }]) => ({
              title,
              url,
              contentType: type,
              savedAt,
              relevantContent: texts.join("\n\n"),
            }),
          );
        } catch (err) {
          captureToolError("searchContent", err, toolCtx);
          emitChatStreamProtocolError(toolCtx.streamWriter, {
            code: CHAT_ERROR_CODES.TOOL_FAILED,
            userMessage:
              "Something went wrong while searching your saved content. Please try again.",
            tool: "searchContent",
          });
          throw err;
        }
      },
    }),
  };
}

export async function buildMentionContext(
  mentionedLinkIds: string[],
): Promise<string | null> {
  if (mentionedLinkIds.length === 0) return null;

  const linkContents = await prisma.linkContent.findMany({
    where: { linkId: { in: mentionedLinkIds } },
    orderBy: [{ linkId: "asc" }, { chunkIndex: "asc" }],
    select: {
      content: true,
      link: { select: { title: true, url: true } },
    },
  });

  if (linkContents.length === 0) return null;

  const grouped = new Map<string, { url: string; texts: string[] }>();
  for (const chunk of linkContents) {
    const existing = grouped.get(chunk.link.title);
    if (existing) {
      existing.texts.push(chunk.content);
    } else {
      grouped.set(chunk.link.title, {
        url: chunk.link.url,
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

export type StreamChatResponseOptions = {
  chatId: string;
  onAssistantText?: (text: string) => void | Promise<void>;
  streamWriter?: UIMessageStreamWriter<PurlChatUIMessage>;
};

export function streamChatResponse(
  messages: ModelMessage[],
  userId: string,
  context: string | null,
  options: StreamChatResponseOptions,
) {
  const { chatId, onAssistantText, streamWriter } = options;
  let streamFailureNotified = false;
  function notifyStreamFailure(): void {
    if (streamFailureNotified) return;
    streamFailureNotified = true;
    emitChatStreamProtocolError(streamWriter, {
      code: CHAT_ERROR_CODES.STREAM_FAILED,
      userMessage: "Something went wrong. Please try again.",
    });
  }

  return streamText({
    model: getChatModel(),
    system: buildSystemPrompt(context),
    messages,
    tools: buildChatTools(userId, { chatId, streamWriter }),
    stopWhen: stepCountIs(5),
    onError: ({ error }) => {
      Sentry.captureException(error, {
        tags: {
          phase: "stream",
          userId,
          chatId,
        },
      });
      notifyStreamFailure();
    },
    onFinish: async ({ text, finishReason }) => {
      if (finishReason === "error") {
        Sentry.captureMessage("Chat stream finished with error finishReason", {
          level: "error",
          tags: {
            phase: "stream",
            userId,
            chatId,
          },
          extra: {
            textLength: text.length,
          },
        });
        notifyStreamFailure();
      }
      if (onAssistantText) await onAssistantText(text);
    },
  });
}
