"use client";

import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { cn } from "@/lib/utils";
import { assistantContentLikelyUsesMarkdown } from "@/utils/assistant-markdown-heuristic";
import type { Link } from "@/utils/links";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { LucideIcon } from "lucide-react";
import { ListIcon, Loader2, SearchIcon } from "lucide-react";
import Image from "next/image";
import { Suspense, lazy } from "react";
import { Typography } from "../typography";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
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

const MAX_TOOL_RESULT_CHIPS = 10;

function extractTitleStrings(output: unknown): string[] {
  if (!Array.isArray(output)) return [];
  const titles: string[] = [];
  for (const item of output) {
    if (item && typeof item === "object" && "title" in item) {
      const t = (item as { title: unknown }).title;
      if (typeof t === "string" && t.trim()) titles.push(t.trim());
    }
  }
  return titles;
}

function formatSavedItemsFilterDescription(
  input: Record<string, unknown>,
): string | undefined {
  const bits: string[] = [];
  const contentType = input.contentType;
  if (typeof contentType === "string" && contentType) {
    bits.push(`Type: ${contentType}`);
  }
  const hasFrom = typeof input.dateFrom === "string";
  const hasTo = typeof input.dateTo === "string";
  if (hasFrom || hasTo) {
    bits.push(
      `Dates: ${hasFrom ? input.dateFrom : "…"} – ${hasTo ? input.dateTo : "…"}`,
    );
  }
  const limit = input.limit;
  if (typeof limit === "number") {
    bits.push(`Limit: ${limit}`);
  }
  return bits.length > 0 ? bits.join(" · ") : undefined;
}

function formatSearchContentDescription(
  input: Record<string, unknown>,
): string | undefined {
  const bits: string[] = [];
  const query = input.query;
  if (typeof query === "string" && query.trim()) {
    bits.push(`"${query.trim()}"`);
  }
  const filters = formatSavedItemsFilterDescription(input);
  if (filters) bits.push(filters);
  return bits.length > 0 ? bits.join(" · ") : undefined;
}

type AssistantToolStep = {
  id: string;
  label: string;
  description?: string;
  status: "complete" | "active" | "pending";
  className?: string;
  icon: LucideIcon;
  resultTitles?: string[];
};

function buildAssistantToolSteps(
  message: UIMessage,
  isLoading: boolean | undefined,
): AssistantToolStep[] {
  const parts = message.parts ?? [];
  const lastPart = parts.at(-1);

  return parts.filter(isToolUIPart).map((part) => {
    const name = getToolName(part);
    const input =
      part.input !== undefined &&
      part.input !== null &&
      typeof part.input === "object"
        ? (part.input as Record<string, unknown>)
        : {};

    let label: string;
    let icon: LucideIcon = SearchIcon;
    let description: string | undefined;

    if (name === "listSavedItems") {
      label = "Listed saved items";
      icon = ListIcon;
      description = formatSavedItemsFilterDescription(input);
    } else if (name === "searchContent") {
      label = "Searched your library";
      description = formatSearchContentDescription(input);
    } else {
      label = `Ran ${name}`;
    }

    let resultTitles: string[] | undefined;
    if (part.state === "output-available" && "output" in part) {
      const titles = extractTitleStrings(part.output);
      const count = Array.isArray(part.output) ? part.output.length : 0;
      if (count === 0 && !description) {
        description = "No results";
      }
      resultTitles =
        titles.length > 0 ? titles.slice(0, MAX_TOOL_RESULT_CHIPS) : undefined;
    }

    if (part.state === "output-error" && "errorText" in part) {
      description = part.errorText;
    }
    if (part.state === "output-denied") {
      description = "Tool call was denied.";
    }

    const isLastPart = lastPart === part;
    let status: AssistantToolStep["status"] = "pending";
    let className: string | undefined;

    if (part.state === "output-available") {
      status = "complete";
    } else if (
      part.state === "output-error" ||
      part.state === "output-denied"
    ) {
      status = "complete";
      className = "text-destructive";
    } else if (isLoading && isLastPart) {
      status = "active";
    } else {
      status = "pending";
    }

    return {
      id: part.toolCallId,
      label,
      description,
      status,
      className,
      icon,
      resultTitles,
    };
  });
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

  const assistantToolSteps =
    role === "assistant" ? buildAssistantToolSteps(message, isLoading) : [];
  const hasToolSteps = assistantToolSteps.length > 0;

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
    role === "assistant" &&
    isLoading &&
    !content &&
    !hasReasoning &&
    !hasToolSteps;

  return (
    <Message
      className={cn(
        "min-w-0 w-full max-w-full flex-row items-start gap-2 p-0",
        // Keep list layout: avatar + body left-aligned (Message defaults user to ml-auto / flex-col).
        role === "user" && "ml-0 justify-start",
      )}
      from={role}
    >
      <div className="shrink-0">{media}</div>
      <MessageContent
        className={cn(
          "min-w-0 w-full flex-1 gap-0",
          // Match prior Item layout: no user bubble / no content shift-right.
          "group-[.is-user]:ml-0 group-[.is-user]:rounded-none group-[.is-user]:bg-transparent group-[.is-user]:px-0 group-[.is-user]:py-0",
          "group-[.is-assistant]:w-full",
        )}
      >
        <div className="line-clamp-none w-full min-w-0 max-w-full">
          {showAssistantSpinner ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <div className={cn("min-w-0 max-w-full text-sm wrap-anywhere")}>
              {role === "assistant" && hasReasoning && (
                <Reasoning
                  className="w-full"
                  isStreaming={isReasoningStreaming}
                >
                  <ReasoningTrigger />
                  <ReasoningContent>{reasoningText}</ReasoningContent>
                </Reasoning>
              )}
              {role === "assistant" && hasToolSteps && (
                <ChainOfThought className="mb-3 w-full">
                  <ChainOfThoughtHeader>Tool calls</ChainOfThoughtHeader>
                  <ChainOfThoughtContent>
                    {assistantToolSteps.map((step) => (
                      <ChainOfThoughtStep
                        key={step.id}
                        className={step.className}
                        description={step.description}
                        icon={step.icon}
                        label={step.label}
                        status={step.status}
                      >
                        {step.resultTitles && step.resultTitles.length > 0 && (
                          <ChainOfThoughtSearchResults>
                            {step.resultTitles.map((title, i) => (
                              <ChainOfThoughtSearchResult
                                key={`${step.id}-${i}-${title}`}
                              >
                                {title}
                              </ChainOfThoughtSearchResult>
                            ))}
                          </ChainOfThoughtSearchResults>
                        )}
                      </ChainOfThoughtStep>
                    ))}
                  </ChainOfThoughtContent>
                </ChainOfThought>
              )}
              {role === "assistant" && content ? (
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
        </div>
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
      </MessageContent>
    </Message>
  );
}
