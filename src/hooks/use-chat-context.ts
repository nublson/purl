import { ChatContext } from "@/contexts/chat-context";
import { useContext } from "react";

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return ctx;
}

export function useChatContextSafe() {
  return useContext(ChatContext);
}
