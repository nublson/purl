import { describe, expect, it } from "vitest";
import { shouldSyncChatFromServer } from "./chat-sync-guard";

const baseInput = {
  chatId: "chat-1",
  lastSyncedChatId: null,
  hasPendingSummarize: false,
  hasPendingMessage: false,
  summarizeInFlight: false,
  pendingMessageInFlight: false,
};

describe("shouldSyncChatFromServer", () => {
  it("returns false when chatId is null", () => {
    expect(
      shouldSyncChatFromServer({ ...baseInput, chatId: null }),
    ).toBe(false);
  });

  it("returns false when the chat was already synced", () => {
    expect(
      shouldSyncChatFromServer({
        ...baseInput,
        lastSyncedChatId: "chat-1",
      }),
    ).toBe(false);
  });

  it("returns true when chatId is set and not yet synced", () => {
    expect(shouldSyncChatFromServer(baseInput)).toBe(true);
  });

  it("returns true when switching to a different chat id", () => {
    expect(
      shouldSyncChatFromServer({
        ...baseInput,
        chatId: "chat-2",
        lastSyncedChatId: "chat-1",
      }),
    ).toBe(true);
  });

  it("returns false while a summarize action is pending", () => {
    expect(
      shouldSyncChatFromServer({
        ...baseInput,
        hasPendingSummarize: true,
      }),
    ).toBe(false);
  });

  it("returns false while a pending message is queued", () => {
    expect(
      shouldSyncChatFromServer({
        ...baseInput,
        hasPendingMessage: true,
      }),
    ).toBe(false);
  });

  it("returns false while summarize is in flight", () => {
    expect(
      shouldSyncChatFromServer({
        ...baseInput,
        summarizeInFlight: true,
      }),
    ).toBe(false);
  });

  it("returns false while a pending message send is in flight", () => {
    expect(
      shouldSyncChatFromServer({
        ...baseInput,
        pendingMessageInFlight: true,
      }),
    ).toBe(false);
  });
});
