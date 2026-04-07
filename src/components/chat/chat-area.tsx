"use client";

import type { Link } from "@/utils/links";
import type { UIMessage } from "ai";
import { useEffect, useRef } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { Skeleton } from "../ui/skeleton";
import { ChatEmpty } from "./chat-empty";
import ChatMessage from "./chat-message";

interface ChatAreaProps {
  messages: UIMessage[];
  messageMentions?: Link[][];
  isLoading: boolean;
  isLoadingChat?: boolean;
  onSuggestion: (text: string) => void;
}

const SKELETON_ROWS: Array<{ role: "user" | "assistant"; lines: string[] }> = [
  { role: "user", lines: ["w-40"] },
  { role: "assistant", lines: ["w-56", "w-44"] },
  { role: "user", lines: ["w-32"] },
  { role: "assistant", lines: ["w-48", "w-36", "w-52"] },
];

function ChatAreaSkeleton() {
  return (
    <ScrollArea className="flex-1 w-full h-20 p-4 pb-0 overflow-hidden">
      <div className="flex w-full min-w-0 flex-col items-stretch justify-start gap-4 h-full">
        {SKELETON_ROWS.map((row, i) => (
          <div key={i} className="flex items-start gap-2 w-full">
            <Skeleton className="size-5 shrink-0 rounded-full" />
            <div className="flex flex-col gap-1.5 flex-1">
              {row.lines.map((w, j) => (
                <Skeleton key={j} className={`h-3.5 ${w}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function getMessageText(message: UIMessage): string {
  return (
    message.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("") ?? ""
  );
}

/** Aligns `messageMentions[i]` with the i-th user message in order. */
function getMentionsPerMessage(
  messages: UIMessage[],
  messageMentions: Link[][] | undefined,
): Link[][] {
  if (!messageMentions) {
    return messages.map(() => []);
  }
  let userIdx = -1;
  return messages.map((m) => {
    if (m.role !== "user") return [];
    userIdx += 1;
    return messageMentions[userIdx] ?? [];
  });
}

export default function ChatArea({
  messages,
  messageMentions,
  isLoading,
  isLoadingChat,
  onSuggestion,
}: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (isLoadingChat) {
    return <ChatAreaSkeleton />;
  }

  if (messages.length === 0) {
    return <ChatEmpty onSuggestion={onSuggestion} />;
  }

  const mentionsPerMessage = getMentionsPerMessage(messages, messageMentions);

  return (
    <ScrollArea className="flex-1 w-full h-20 p-4 pb-0 overflow-hidden">
      <div className="flex w-full min-w-0 flex-col items-stretch justify-start gap-4 h-full">
        {messages.map((message, index) => (
          <ChatMessage
            key={message.id}
            content={getMessageText(message)}
            role={message.role as "user" | "assistant"}
            mentions={mentionsPerMessage[index] ?? []}
          />
        ))}
        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <ChatMessage content="" role="assistant" isLoading />
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
