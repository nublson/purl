"use client";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { cn } from "@/lib/utils";
import { assistantContentLikelyUsesMarkdown } from "@/utils/assistant-markdown-heuristic";
import type { Link } from "@/utils/links";
import type { UIMessage } from "ai";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { Suspense, lazy } from "react";
import { Typography } from "../typography";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Item, ItemContent, ItemMedia, ItemTitle } from "../ui/item";
import ChatMention from "./chat-mention";

const ChatMarkdownBody = lazy(() =>
  import("./chat-markdown-body").then((m) => ({
    default: m.ChatMarkdownBody,
  })),
);

function getMessageText(message: UIMessage): string {
  return (
    message.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("") ?? ""
  );
}

interface ChatMessageProps {
  message: UIMessage;
  isLoading?: boolean;
  mentions?: Link[];
  /** Session profile image for user messages */
  userAvatarUrl?: string | null;
  /** Used for avatar alt text and fallback initial */
  userDisplayName?: string | null;
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

export default function ChatMessage({
  message,
  isLoading,
  mentions,
  userAvatarUrl,
  userDisplayName,
}: ChatMessageProps) {
  const role = message.role as "user" | "assistant";
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

  const userInitial = userDisplayName?.trim().charAt(0)?.toUpperCase() ?? "?";

  const media =
    role === "user" ? (
      <Avatar className="size-5">
        <AvatarImage
          src={userAvatarUrl ?? ""}
          alt={userDisplayName?.trim() || "You"}
        />
        <AvatarFallback>{userInitial}</AvatarFallback>
      </Avatar>
    ) : (
      <Image src="/logo.svg" alt="Purl" width={20} height={20} priority />
    );

  const showAssistantSpinner =
    role === "assistant" && isLoading && !content && !hasReasoning;

  return (
    <Item className="min-w-0 w-full p-0 gap-2 items-start">
      <ItemMedia>{media}</ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-none w-full min-w-0 max-w-full">
          {showAssistantSpinner ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <div className={cn("min-w-0 max-w-full text-sm wrap-anywhere")}>
              {role === "assistant" && hasReasoning && (
                <Reasoning className="w-full" isStreaming={isReasoningStreaming}>
                  <ReasoningTrigger />
                  <ReasoningContent>{reasoningText}</ReasoningContent>
                </Reasoning>
              )}
              {role === "assistant" && content
                ? assistantContentLikelyUsesMarkdown(content) ? (
                    <Suspense
                      fallback={<AssistantMarkdownFallback content={content} />}
                    >
                      <ChatMarkdownBody content={content} />
                    </Suspense>
                  ) : (
                    <AssistantMarkdownFallback content={content} />
                  )
                : null}
              {role === "user" && (
                <Typography
                  size="small"
                  className="text-accent-foreground wrap-anywhere"
                >
                  {content}
                </Typography>
              )}
            </div>
          )}
        </ItemTitle>
        {role === "user" && mentions && mentions.length > 0 && (
          <div className="w-full flex items-center justify-start gap-1 no-scrollbar overflow-x-auto overflow-y-hidden">
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
      </ItemContent>
    </Item>
  );
}
