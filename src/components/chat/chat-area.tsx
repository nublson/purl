"use client";

import type { UIMessage } from "ai";
import { useEffect, useRef } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { ChatEmpty } from "./chat-empty";
import ChatMessage from "./chat-message";

interface ChatAreaProps {
  messages: UIMessage[];
  isLoading: boolean;
  onSuggestion: (text: string) => void;
}

function getMessageText(message: UIMessage): string {
  return (
    message.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("") ?? ""
  );
}

export default function ChatArea({
  messages,
  isLoading,
  onSuggestion,
}: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return <ChatEmpty onSuggestion={onSuggestion} />;
  }

  return (
    <ScrollArea className="flex-1 w-full h-20 p-4 pb-0 overflow-hidden">
      <div className="flex flex-col items-center justify-start gap-4 h-full">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            content={getMessageText(message)}
            role={message.role as "user" | "assistant"}
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
