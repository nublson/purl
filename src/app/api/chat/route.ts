import { auth } from "@/lib/auth";
import { buildMentionContext, streamChatResponse } from "@/lib/chat";
import { chatJsonError } from "@/lib/chat-api-error-response";
import { CHAT_ERROR_CODES } from "@/lib/chat-http-errors";
import type { PurlChatUIMessage } from "@/lib/chat-stream-error";
import {
  filterMentionLinkIdsForUser,
  saveMessage,
  verifyChatOwnership,
} from "@/lib/chats";
import * as Sentry from "@sentry/nextjs";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { headers } from "next/headers";

export const maxDuration = 60;

type ChatRoutePhase =
  | "verify_ownership"
  | "prepare_stream"
  | "save_user_message"
  | "stream_start";

function httpStatusFromUnknownError(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const o = err as Record<string, unknown>;
  if (typeof o.statusCode === "number") return o.statusCode;
  const cause = o.cause;
  if (cause && typeof cause === "object") {
    const c = cause as Record<string, unknown>;
    if (typeof c.statusCode === "number") return c.statusCode;
    if (typeof c.status === "number") return c.status;
  }
  if (typeof o.status === "number") return o.status;
  return undefined;
}

function isRateLimitedError(err: unknown): boolean {
  const s = httpStatusFromUnknownError(err);
  if (s === 429) return true;
  const msg =
    err instanceof Error ? `${err.message} ${err.cause ?? ""}` : String(err);
  return /rate\s*limit|429|too many requests/i.test(msg);
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) {
    return chatJsonError(
      401,
      CHAT_ERROR_CODES.SESSION_EXPIRED,
      "Please sign in again.",
    );
  }

  const userId = session.user.id;

  let messages: UIMessage[];
  let chatId: string;
  let mentionedLinkIds: string[] | undefined;
  /** Client-generated id for retries / dedupe; not persisted yet. */
  let requestId: string | undefined;

  try {
    const body = await request.json();
    messages = body.messages;
    chatId = body.chatId;
    mentionedLinkIds = body.mentionedLinkIds;
    if (typeof body.requestId === "string" && body.requestId.trim()) {
      requestId = body.requestId.trim();
    }
  } catch {
    return chatJsonError(
      400,
      CHAT_ERROR_CODES.BAD_REQUEST,
      "Invalid request body.",
    );
  }

  if (!chatId || typeof chatId !== "string") {
    return chatJsonError(
      400,
      CHAT_ERROR_CODES.BAD_REQUEST,
      "chatId is required.",
    );
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return chatJsonError(
      400,
      CHAT_ERROR_CODES.BAD_REQUEST,
      "Messages array is required.",
    );
  }

  const isOwner = await verifyChatOwnership(chatId, userId);
  if (!isOwner) {
    return chatJsonError(
      404,
      CHAT_ERROR_CODES.CHAT_NOT_FOUND,
      "Chat not found.",
    );
  }

  let ownedMentionLinkIds: string[] | undefined;
  if (mentionedLinkIds && mentionedLinkIds.length > 0) {
    ownedMentionLinkIds = await filterMentionLinkIdsForUser(
      userId,
      mentionedLinkIds,
    );
  }

  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");
  const query =
    lastUserMessage?.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ") ?? "";

  let phase: ChatRoutePhase = "prepare_stream";

  try {
    const ownedIds = ownedMentionLinkIds;
    const hasMentionContext = Boolean(ownedIds?.length);

    let context: string | null;
    let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
    if (hasMentionContext && ownedIds) {
      [context, modelMessages] = await Promise.all([
        buildMentionContext(userId, ownedIds),
        convertToModelMessages(messages),
      ]);
    } else {
      context = null;
      modelMessages = await convertToModelMessages(messages);
    }

    phase = "save_user_message";
    await saveMessage(
      chatId,
      "USER",
      query,
      ownedMentionLinkIds && ownedMentionLinkIds.length > 0
        ? ownedMentionLinkIds
        : undefined,
    );

    phase = "stream_start";
    const stream = createUIMessageStream<PurlChatUIMessage>({
      execute: async ({ writer }) => {
        const result = await streamChatResponse(
          modelMessages,
          userId,
          context,
          {
            chatId,
            streamWriter: writer,
            onAssistantText: async (text) => {
              await saveMessage(chatId, "ASSISTANT", text);
            },
          },
        );
        if (result) {
          writer.merge(result.toUIMessageStream({ sendReasoning: true }));
        }
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (err) {
    Sentry.captureException(err, {
      tags: {
        chatId,
        userId,
        phase,
      },
      extra: requestId ? { requestId } : undefined,
    });

    if (isRateLimitedError(err)) {
      return chatJsonError(
        429,
        CHAT_ERROR_CODES.RATE_LIMITED,
        "Too many requests. Try again shortly.",
        {
          retryAfterSeconds: 60,
        },
      );
    }

    return chatJsonError(
      500,
      CHAT_ERROR_CODES.INTERNAL_ERROR,
      "Something went wrong. Please try again.",
    );
  }
}
