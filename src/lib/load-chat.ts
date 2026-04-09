import type { ParsedChatError } from "@/lib/chat-http-errors";
import { parseChatErrorFromResponse } from "@/lib/chat-http-errors";
import type { Link } from "@/utils/links";
import type { UIMessage } from "ai";

export type LoadedChatPayload = {
  id: string;
  title: string | null;
  messages: UIMessage[];
  messageMentions: Link[][];
};

export type LoadChatResult =
  | { ok: true; payload: LoadedChatPayload }
  | { ok: false; aborted: true }
  | {
      ok: false;
      aborted: false;
      status: number;
      parsed: ParsedChatError | null;
    };

/**
 * Fetches a chat and maps DB rows to UI message state for the widget.
 * On success returns payload; on failure returns status (unless aborted).
 */
export async function loadChatFromApi(
  id: string,
  signal?: AbortSignal,
): Promise<LoadChatResult> {
  try {
    const res = await fetch(`/api/chats/${id}`, { signal });
    if (signal?.aborted) {
      return { ok: false, aborted: true };
    }

    if (!res.ok) {
      const parsed = await parseChatErrorFromResponse(res);
      return {
        ok: false,
        aborted: false,
        status: res.status,
        parsed,
      };
    }

    const data = (await res.json()) as {
      id: string;
      title: string | null;
      messages: {
        id: string;
        role: "USER" | "ASSISTANT";
        content: string;
        mentions: Link[];
      }[];
    };

    const messages: UIMessage[] = data.messages.map((msg) => ({
      id: msg.id,
      role: msg.role === "USER" ? "user" : "assistant",
      content: msg.content,
      parts: [{ type: "text" as const, text: msg.content }],
    }));

    const messageMentions: Link[][] = data.messages.map((msg) =>
      msg.role === "USER" ? msg.mentions : [],
    );

    return {
      ok: true,
      payload: {
        id: data.id,
        title: data.title?.trim() || null,
        messages,
        messageMentions,
      },
    };
  } catch (e) {
    if (signal?.aborted) {
      return { ok: false, aborted: true };
    }
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, aborted: true };
    }
    return {
      ok: false,
      aborted: false,
      status: 0,
      parsed: null,
    };
  }
}
