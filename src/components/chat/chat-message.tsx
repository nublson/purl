"use client";

import type { Link } from "@/utils/links";
import type { UIMessage } from "ai";
import ChatAssistantMessage from "./chat-assistant-message";
import ChatMention from "./chat-mention";
import ChatUserMessage from "./chat-user-message";

export interface ChatMessageProps {
  message: UIMessage;
  isLoading?: boolean;
  mentions?: Link[];
  userAvatarUrl?: string | null;
  userDisplayName?: string | null;
}

export default function ChatMessage({
  message,
  isLoading,
  mentions,
  userAvatarUrl,
  userDisplayName,
}: ChatMessageProps) {
  const content =
    message.role === "user" ? (
      <ChatUserMessage
        message={message}
        userAvatarUrl={userAvatarUrl}
        userDisplayName={userDisplayName}
      />
    ) : (
      <ChatAssistantMessage message={message} isLoading={isLoading} />
    );

  return (
    <div className="flex flex-col gap-2">
      {content}
      {mentions && mentions.length > 0 && (
        <div className="flex w-full items-center justify-end gap-1 overflow-x-auto overflow-y-hidden no-scrollbar pr-7">
          {mentions.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ChatMention link={link} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
