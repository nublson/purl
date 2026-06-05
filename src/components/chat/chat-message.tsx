"use client";

import type { Link } from "@/utils/links";
import type { UIMessage } from "ai";
import ChatAssistantMessage from "./chat-assistant-message";
import ChatUserMessage from "./chat-user-message";

export interface ChatMessageProps {
  message: UIMessage;
  isLoading?: boolean;
  mentions?: Link[];
  /** Session profile image for user messages */
  userAvatarUrl?: string | null;
  /** Used for avatar alt text and fallback initial */
  userDisplayName?: string | null;
}

export default function ChatMessage({
  message,
  isLoading,
  mentions,
  userAvatarUrl,
  userDisplayName,
}: ChatMessageProps) {
  if (message.role === "user") {
    return (
      <ChatUserMessage
        message={message}
        mentions={mentions}
        userAvatarUrl={userAvatarUrl}
        userDisplayName={userDisplayName}
      />
    );
  }

  return <ChatAssistantMessage message={message} isLoading={isLoading} />;
}
