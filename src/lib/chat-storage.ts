import type { Link } from "@/utils/links";

const LAST_CHAT_ID_KEY = "purl:chat:lastChatId";

/** Draft bucket before a real chat id exists (first message not sent yet). */
export const DRAFT_NEW_CHAT_KEY = "__new__";

function draftKey(chatId: string): string {
  return `purl:chat:draft:${chatId}`;
}

export function getLastChatId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(LAST_CHAT_ID_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setLastChatId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_CHAT_ID_KEY, id);
  } catch {
    /* ignore */
  }
}

export function clearLastChatId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LAST_CHAT_ID_KEY);
  } catch {
    /* ignore */
  }
}

export function getDraft(chatId: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(draftKey(chatId)) ?? "";
  } catch {
    return "";
  }
}

export function setDraft(chatId: string, text: string): void {
  if (typeof window === "undefined") return;
  try {
    if (!text) {
      window.localStorage.removeItem(draftKey(chatId));
    } else {
      window.localStorage.setItem(draftKey(chatId), text);
    }
  } catch {
    /* ignore */
  }
}

export function clearDraft(chatId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(draftKey(chatId));
  } catch {
    /* ignore */
  }
}

const SNAPSHOT_VERSION = 1 as const;

export type ChatSnapshotV1 = {
  v: typeof SNAPSHOT_VERSION;
  title: string | null;
  /** Serialized `UIMessage[]` from the AI SDK */
  messages: unknown[];
  messageMentions: Link[][];
};

function snapshotKey(chatId: string): string {
  return `purl:chat:snapshot:${chatId}`;
}

export function getChatSnapshot(chatId: string): ChatSnapshotV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(snapshotKey(chatId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatSnapshotV1;
    if (
      parsed?.v !== SNAPSHOT_VERSION ||
      !Array.isArray(parsed.messages) ||
      !Array.isArray(parsed.messageMentions)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setChatSnapshot(chatId: string, snapshot: ChatSnapshotV1): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(snapshotKey(chatId), JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}

export function clearChatSnapshot(chatId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(snapshotKey(chatId));
  } catch {
    /* ignore */
  }
}
