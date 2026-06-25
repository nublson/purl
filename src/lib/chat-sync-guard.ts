export type ChatSyncGuardInput = {
  chatId: string | null;
  lastSyncedChatId: string | null;
  hasPendingSummarize: boolean;
  hasPendingMessage: boolean;
  summarizeInFlight: boolean;
  pendingMessageInFlight: boolean;
};

/** Whether the client should fetch chat state from the server for the current chatId. */
export function shouldSyncChatFromServer(input: ChatSyncGuardInput): boolean {
  if (!input.chatId) return false;
  if (input.hasPendingSummarize || input.hasPendingMessage) return false;
  if (input.summarizeInFlight || input.pendingMessageInFlight) return false;
  if (input.lastSyncedChatId === input.chatId) return false;
  return true;
}
