import type { Link } from "@/utils/links";
import type { UIMessage } from "ai";

export type LoadedChatPayload = {
  id: string;
  title: string | null;
  messages: UIMessage[];
  messageMentions: Link[][];
};

/**
 * Fetches a chat and maps DB rows to UI message state for the widget.
 * Returns null when the chat is missing or the request fails.
 */
export async function loadChatFromApi(
  id: string,
  signal?: AbortSignal,
): Promise<LoadedChatPayload | null> {
  try {
    const res = await fetch(`/api/chats/${id}`, { signal });
    if (!res.ok) return null;
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
      id: data.id,
      title: data.title?.trim() || null,
      messages,
      messageMentions,
    };
  } catch (e) {
    if (signal?.aborted) return null;
    if (e instanceof DOMException && e.name === "AbortError") return null;
    return null;
  }
}
