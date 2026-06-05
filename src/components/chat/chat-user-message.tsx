"use client";

import { Message, MessageContent } from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import type { UIMessage } from "ai";
import { Typography } from "../typography";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import ChatMention from "./chat-mention";
import { getMessageText } from "./chat-message-utils";

export interface ChatUserMessageProps {
  message: UIMessage;
  mentions?: Link[];
  userAvatarUrl?: string | null;
  userDisplayName?: string | null;
}

export default function ChatUserMessage({
  message,
  mentions,
  userAvatarUrl,
  userDisplayName,
}: ChatUserMessageProps) {
  const content = getMessageText(message);
  const userInitial = userDisplayName?.trim().charAt(0)?.toUpperCase() ?? "?";

  return (
    <Message
      className={cn(
        "min-w-0 w-full max-w-full flex-row-reverse items-start gap-2 p-0",
      )}
      from="user"
    >
      <div className="shrink-0 mt-3">
        <Avatar className="size-5">
          <AvatarImage
            src={userAvatarUrl ?? ""}
            alt={userDisplayName?.trim() || "You"}
          />
          <AvatarFallback>{userInitial}</AvatarFallback>
        </Avatar>
      </div>
      <MessageContent className="min-w-0 max-w-[85%] gap-2">
        <Typography
          size="small"
          className="text-accent-foreground wrap-anywhere"
        >
          {content}
        </Typography>
        {mentions && mentions.length > 0 && (
          <div className="flex w-full items-center justify-end gap-1 overflow-x-auto overflow-y-hidden no-scrollbar">
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
      </MessageContent>
    </Message>
  );
}
