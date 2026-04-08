"use client";

import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { Suspense, lazy } from "react";
import { Typography } from "../typography";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "../ui/item";

const ChatMarkdownBody = lazy(() =>
  import("./chat-markdown-body").then((m) => ({
    default: m.ChatMarkdownBody,
  })),
);

interface ChatMessageProps {
  content: string;
  role: "user" | "assistant";
  isLoading?: boolean;
  mentions?: Link[];
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
  content,
  role,
  isLoading,
  mentions,
}: ChatMessageProps) {
  const media =
    role === "user" ? (
      <Avatar className="size-5">
        <AvatarImage src="https://github.com/nublson.png" />
        <AvatarFallback>N</AvatarFallback>
      </Avatar>
    ) : (
      <Image src="/logo.svg" alt="Purl" width={20} height={20} priority />
    );

  return (
    <Item className="min-w-0 w-full p-0 gap-2 items-start">
      <ItemMedia>{media}</ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-none w-full min-w-0 max-w-full">
          {isLoading && !content ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <div className={cn("min-w-0 max-w-full text-sm wrap-anywhere")}>
              {role === "assistant" ? (
                <Suspense fallback={<AssistantMarkdownFallback content={content} />}>
                  <ChatMarkdownBody content={content} />
                </Suspense>
              ) : (
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
          <ItemDescription className="text-xs">
            {mentions.map((link, index) => (
              <span key={link.id}>
                {index > 0 ? ", " : ""}
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  @{link.title}
                </a>
              </span>
            ))}
          </ItemDescription>
        )}
      </ItemContent>
    </Item>
  );
}
