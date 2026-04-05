"use client";

import {
  extractMentionLinkIds,
  formatMentionToken,
} from "@/lib/chat-utils";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ChevronDown, ChevronUp, MessageCircle, Square } from "lucide-react";
import * as React from "react";
import { chatSurfaceRef } from "./chat-context";
import { ChatInput } from "./chat-input";
import { ChatMessages } from "./chat-messages";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";

function normalizeClientLinks(links: Link[]): Link[] {
  return links.map((link) => ({
    ...link,
    createdAt:
      link.createdAt instanceof Date ? link.createdAt : new Date(link.createdAt),
  }));
}

export function ChatPanel({
  links: linksProp,
  className,
}: {
  links: Link[];
  className?: string;
}) {
  const links = React.useMemo(
    () => normalizeClientLinks(linksProp),
    [linksProp],
  );

  const [expanded, setExpanded] = React.useState(false);
  const [input, setInput] = React.useState("");
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const [transport] = React.useState(
    () => new DefaultChatTransport({ api: "/api/chat" }),
  );

  const { messages, sendMessage, status, stop, error } = useChat({ transport });

  const busy = status === "submitted" || status === "streaming";

  const openWithMention = React.useCallback((link: Link) => {
    setExpanded(true);
    setInput((prev) => {
      const token = `${formatMentionToken(link)} `;
      const base = prev.trim();
      return base ? `${base} ${token}` : token;
    });
  }, []);

  React.useEffect(() => {
    chatSurfaceRef.current = { openWithMention };
    return () => {
      chatSurfaceRef.current = null;
    };
  }, [openWithMention]);

  React.useEffect(() => {
    if (!expanded) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, expanded, status]);

  const handleSubmit = React.useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;
    setExpanded(true);
    void sendMessage(
      { text },
      { body: { mentionedLinkIds: extractMentionLinkIds(text) } },
    );
    setInput("");
  }, [input, busy, sendMessage]);

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md dark:shadow-[0_-4px_24px_rgba(0,0,0,0.25)]",
        className,
      )}
    >
      <div className="wrapper-private mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
          >
            <MessageCircle className="size-4" />
            <span className="font-medium">Chat</span>
            {expanded ? (
              <ChevronDown className="size-4 opacity-70" />
            ) : (
              <ChevronUp className="size-4 opacity-70" />
            )}
          </Button>
          {busy ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void stop()}
            >
              <Square className="size-3.5" />
              Stop
            </Button>
          ) : null}
        </div>

        {expanded ? (
          <div className="flex max-h-[min(50vh,28rem)] flex-col gap-3 overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-muted/20 p-3">
              {error ? (
                <p className="mb-2 text-sm text-destructive" role="alert">
                  {error.message}
                </p>
              ) : null}
              <ChatMessages messages={messages} status={status} />
              <div ref={messagesEndRef} />
            </div>
          </div>
        ) : null}

        <ChatInput
          links={links}
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={busy}
        />

        {busy && !expanded ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3.5" />
            Purl is thinking…
          </div>
        ) : null}
      </div>
    </div>
  );
}
