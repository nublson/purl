import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The vitest environment is "node" – `window` does not exist by default.
// The chat-storage helpers guard on `typeof window === "undefined"`, so we
// must stub the global `window` object with fake localStorage/sessionStorage
// implementations to exercise the real code paths.

import {
  clearChatSnapshot,
  clearDraft,
  clearLastChatId,
  DRAFT_NEW_CHAT_KEY,
  getChatSnapshot,
  getDraft,
  getLastChatId,
  setChatSnapshot,
  setDraft,
  setLastChatId,
  type ChatSnapshotV1,
} from "./chat-storage";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

/**
 * Stub `globalThis.window` with fake localStorage and sessionStorage so the
 * SSR guard in chat-storage.ts (`typeof window === "undefined"`) does not
 * short-circuit the tests.
 */
function stubWindow(ls: Storage, ss: Storage) {
  vi.stubGlobal("window", { localStorage: ls, sessionStorage: ss });
}

// ─── DRAFT_NEW_CHAT_KEY constant ─────────────────────────────────────────────

describe("DRAFT_NEW_CHAT_KEY", () => {
  it("is a stable sentinel for the new-chat draft slot", () => {
    expect(DRAFT_NEW_CHAT_KEY).toBe("__new__");
  });
});

// ─── getLastChatId / setLastChatId / clearLastChatId ─────────────────────────

describe("getLastChatId / setLastChatId / clearLastChatId", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = makeStorage();
    stubWindow(storage, makeStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when nothing has been stored yet", () => {
    expect(getLastChatId()).toBeNull();
  });

  it("returns the id that was previously stored", () => {
    setLastChatId("chat-abc");
    expect(getLastChatId()).toBe("chat-abc");
  });

  it("trims whitespace from stored values", () => {
    storage.setItem("purl:chat:lastChatId", "  chat-xyz  ");
    expect(getLastChatId()).toBe("chat-xyz");
  });

  it("returns null when the stored value is blank (only whitespace)", () => {
    storage.setItem("purl:chat:lastChatId", "   ");
    expect(getLastChatId()).toBeNull();
  });

  it("clearLastChatId removes the stored id", () => {
    setLastChatId("chat-abc");
    clearLastChatId();
    expect(getLastChatId()).toBeNull();
  });

  it("getLastChatId returns null when window is undefined (SSR guard)", () => {
    vi.unstubAllGlobals();
    expect(getLastChatId()).toBeNull();
  });

  it("setLastChatId silently swallows storage quota errors", () => {
    storage.setItem = () => {
      throw new DOMException("QuotaExceededError");
    };
    expect(() => setLastChatId("chat-abc")).not.toThrow();
  });

  it("clearLastChatId silently swallows storage errors", () => {
    storage.removeItem = () => {
      throw new DOMException("SecurityError");
    };
    expect(() => clearLastChatId()).not.toThrow();
  });
});

// ─── getDraft / setDraft / clearDraft ────────────────────────────────────────

describe("getDraft / setDraft / clearDraft", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = makeStorage();
    stubWindow(storage, makeStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns empty string when no draft exists", () => {
    expect(getDraft("chat-1")).toBe("");
  });

  it("stores and retrieves a draft for a chat id", () => {
    setDraft("chat-1", "Hello world");
    expect(getDraft("chat-1")).toBe("Hello world");
  });

  it("stores drafts under separate keys per chat id", () => {
    setDraft("chat-1", "Draft one");
    setDraft("chat-2", "Draft two");
    expect(getDraft("chat-1")).toBe("Draft one");
    expect(getDraft("chat-2")).toBe("Draft two");
  });

  it("setDraft with empty string removes the draft entry", () => {
    setDraft("chat-1", "Some text");
    setDraft("chat-1", "");
    expect(getDraft("chat-1")).toBe("");
  });

  it("clearDraft removes the draft entry", () => {
    setDraft("chat-1", "Pending text");
    clearDraft("chat-1");
    expect(getDraft("chat-1")).toBe("");
  });

  it("getDraft returns empty string when window is undefined (SSR)", () => {
    vi.unstubAllGlobals();
    expect(getDraft("chat-1")).toBe("");
  });

  it("setDraft silently ignores storage errors", () => {
    storage.setItem = () => {
      throw new DOMException("QuotaExceededError");
    };
    expect(() => setDraft("chat-1", "text")).not.toThrow();
  });

  it("getDraft silently ignores storage errors and returns empty string", () => {
    storage.getItem = () => {
      throw new DOMException("SecurityError");
    };
    expect(getDraft("chat-1")).toBe("");
  });
});

// ─── getChatSnapshot / setChatSnapshot / clearChatSnapshot ───────────────────

describe("getChatSnapshot / setChatSnapshot / clearChatSnapshot", () => {
  let sessionSt: Storage;

  const validSnapshot: ChatSnapshotV1 = {
    v: 1,
    title: "Test chat",
    messages: [{ role: "user", content: "Hi" }],
    messageMentions: [[]],
  };

  beforeEach(() => {
    sessionSt = makeStorage();
    stubWindow(makeStorage(), sessionSt);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when no snapshot has been stored", () => {
    expect(getChatSnapshot("chat-1")).toBeNull();
  });

  it("stores and retrieves a valid snapshot", () => {
    setChatSnapshot("chat-1", validSnapshot);
    const result = getChatSnapshot("chat-1");
    expect(result).toEqual(validSnapshot);
  });

  it("stores snapshots under separate keys per chat id", () => {
    const s2: ChatSnapshotV1 = { ...validSnapshot, title: "Second" };
    setChatSnapshot("chat-1", validSnapshot);
    setChatSnapshot("chat-2", s2);
    expect(getChatSnapshot("chat-1")?.title).toBe("Test chat");
    expect(getChatSnapshot("chat-2")?.title).toBe("Second");
  });

  it("returns null when the stored snapshot has the wrong version", () => {
    const bad = { ...validSnapshot, v: 99 };
    sessionSt.setItem(
      "purl:chat:snapshot:chat-1",
      JSON.stringify(bad),
    );
    expect(getChatSnapshot("chat-1")).toBeNull();
  });

  it("returns null when stored data has no messages array", () => {
    const bad = { v: 1, title: null, messageMentions: [] };
    sessionSt.setItem(
      "purl:chat:snapshot:chat-1",
      JSON.stringify(bad),
    );
    expect(getChatSnapshot("chat-1")).toBeNull();
  });

  it("returns null when stored data has no messageMentions array", () => {
    const bad = { v: 1, title: null, messages: [] };
    sessionSt.setItem(
      "purl:chat:snapshot:chat-1",
      JSON.stringify(bad),
    );
    expect(getChatSnapshot("chat-1")).toBeNull();
  });

  it("returns null when the raw value is not valid JSON", () => {
    sessionSt.setItem("purl:chat:snapshot:chat-1", "{{not json}}");
    expect(getChatSnapshot("chat-1")).toBeNull();
  });

  it("clearChatSnapshot removes the snapshot", () => {
    setChatSnapshot("chat-1", validSnapshot);
    clearChatSnapshot("chat-1");
    expect(getChatSnapshot("chat-1")).toBeNull();
  });

  it("getChatSnapshot returns null when window is undefined (SSR)", () => {
    vi.unstubAllGlobals();
    expect(getChatSnapshot("chat-1")).toBeNull();
  });

  it("setChatSnapshot silently ignores storage errors", () => {
    sessionSt.setItem = () => {
      throw new DOMException("QuotaExceededError");
    };
    expect(() => setChatSnapshot("chat-1", validSnapshot)).not.toThrow();
  });

  it("clearChatSnapshot silently ignores storage errors", () => {
    sessionSt.removeItem = () => {
      throw new DOMException("SecurityError");
    };
    expect(() => clearChatSnapshot("chat-1")).not.toThrow();
  });
});
