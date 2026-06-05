"use client";

import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { cn } from "@/lib/utils";
import { assistantContentLikelyUsesMarkdown } from "@/utils/assistant-markdown-heuristic";
import type { UIMessage } from "ai";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { Suspense, lazy } from "react";
import { Typography } from "../typography";
import { getMessageText } from "./chat-message-utils";

const ChatMarkdownBody = lazy(() =>
  import("./chat-markdown-body").then((m) => ({
    default: m.ChatMarkdownBody,
  })),
);

export interface ChatAssistantMessageProps {
  message: UIMessage;
  isLoading?: boolean;
}

function AssistantMarkdownFallback({ content }: { content: string }) {
  return (
    <Typography
      size="small"
      className="text-accent-foreground wrap-anywhere whitespace-pre-wrap"
    >
      {content}
    </Typography>
  );
}

export default function ChatAssistantMessage({
  message,
  isLoading,
}: ChatAssistantMessageProps) {
  const content = getMessageText(message);

  const reasoningParts =
    message.parts?.filter(
      (p): p is { type: "reasoning"; text: string } => p.type === "reasoning",
    ) ?? [];
  const reasoningText = reasoningParts.map((p) => p.text).join("\n\n");
  const hasReasoning = reasoningParts.length > 0;

  const lastPart = message.parts?.at(-1);
  const isReasoningStreaming =
    Boolean(isLoading) && lastPart?.type === "reasoning";

  const showSpinner = Boolean(isLoading) && !content && !hasReasoning;

  return (
    <Message
      className={cn(
        "min-w-0 w-full max-w-full flex-row items-start gap-2 p-0",
      )}
      from="assistant"
    >
      <div className="shrink-0">
        <Image src="/logo.svg" alt="Purl" width={20} height={20} priority />
      </div>
      <MessageContent className="min-w-0 w-full flex-1 gap-0">
        <div className="line-clamp-none w-full min-w-0 max-w-full">
          {showSpinner ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <div className="min-w-0 max-w-full text-sm wrap-anywhere">
              {hasReasoning && (
                <Reasoning
                  className="w-full"
                  isStreaming={isReasoningStreaming}
                >
                  <ReasoningTrigger />
                  <ReasoningContent>{reasoningText}</ReasoningContent>
                </Reasoning>
              )}
              {content ? (
                assistantContentLikelyUsesMarkdown(content) ? (
                  <Suspense
                    fallback={<AssistantMarkdownFallback content={content} />}
                  >
                    <ChatMarkdownBody content={content} />
                  </Suspense>
                ) : (
                  <AssistantMarkdownFallback content={content} />
                )
              ) : null}
            </div>
          )}
        </div>
      </MessageContent>
    </Message>
  );
}
