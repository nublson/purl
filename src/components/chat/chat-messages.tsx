"use client";

import { MENTION_TOKEN_REGEX } from "@/lib/chat-utils";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { isTextUIPart, type ChatStatus, type UIMessage } from "ai";
import * as React from "react";
import Markdown from "react-markdown";

function UserMessageContent({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  const re = new RegExp(MENTION_TOKEN_REGEX.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(
        <span key={`t-${last}`}>{text.slice(last, m.index)}</span>,
      );
    }
    const title = m[1] || "Link";
    nodes.push(
      <span
        key={`m-${m.index}`}
        className="inline-flex items-center rounded-md bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary"
      >
        @{title}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    nodes.push(<span key={`t-end`}>{text.slice(last)}</span>);
  }
  return <span className="whitespace-pre-wrap wrap-break-word">{nodes}</span>;
}

function messageText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((p) => p.text)
    .join("");
}

export function ChatMessages({
  messages,
  status,
  className,
}: {
  messages: UIMessage[];
  status?: ChatStatus;
  className?: string;
}) {
  if (messages.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        Ask anything about your saved links. Type @ to mention one.
      </p>
    );
  }

  const last = messages[messages.length - 1];
  const showThinking =
    (status === "submitted" && last?.role === "user") ||
    (status === "streaming" &&
      last?.role === "assistant" &&
      !messageText(last).trim());

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {showThinking ? (
        <div className="flex justify-start">
          <div className="flex items-center gap-2 rounded-2xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            Thinking…
          </div>
        </div>
      ) : null}
      {messages.map((message, index) => {
        const text = messageText(message);
        const isLast = index === messages.length - 1;
        if (
          !text.trim() &&
          message.role === "assistant" &&
          isLast &&
          (status === "submitted" || status === "streaming")
        ) {
          return null;
        }
        if (!text.trim() && message.role === "assistant") {
          return null;
        }
        return (
          <div
            key={message.id}
            className={cn(
              "flex",
              message.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[min(100%,42rem)] rounded-2xl px-3 py-2 text-sm",
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border bg-muted/40",
              )}
            >
              {message.role === "user" ? (
                <UserMessageContent text={text} />
              ) : (
                <div
                  className={cn(
                    "prose-chat text-foreground [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ol]:my-2",
                  )}
                >
                  <Markdown
                    components={{
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {text}
                  </Markdown>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
