"use client";

import ChatArea from "@/components/chat/chat-area";
import {
  ChatHistory,
  type ChatHistoryItem,
} from "@/components/chat/chat-history";
import ChatInput from "@/components/chat/chat-input";
import { Logo } from "@/components/logo";
import { Typography } from "@/components/typography";
import { Button } from "@/components/ui/button";
import { ChatProvider } from "@/contexts/chat-context";
import type { UIMessage } from "ai";
import { ChevronDown, Ellipsis, Plus } from "lucide-react";
import { useState } from "react";

interface DemoChat {
  id: string;
  title: string;
  messages: UIMessage[];
  historyItem: ChatHistoryItem;
}

const DEMO_CHATS: DemoChat[] = [
  {
    id: "1",
    title: "AI Agents research",
    historyItem: {
      id: "1",
      title: "AI Agents research",
      updatedAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    },
    messages: [
      {
        id: "1-1",
        role: "user",
        parts: [
          {
            type: "text",
            text: "What are the key ideas from the articles I saved about AI agents?",
          },
        ],
      },
      {
        id: "1-2",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Based on the articles you've saved, here are the key ideas about AI agents:\n\n**1. Agents are context-aware, not just reactive**\nModern AI agents maintain memory across interactions and reason about goals, not just inputs.\n\n**2. Tool use is the real unlock**\nThe shift from chat to agents comes from giving models access to tools — search, code execution, APIs.\n\n**3. Human-in-the-loop remains critical**\nThe most effective deployments keep humans involved for high-stakes decisions, using AI to augment rather than replace judgment.",
          },
        ],
      },
    ],
  },
  {
    id: "2",
    title: "Design system notes",
    historyItem: {
      id: "2",
      title: "Design system notes",
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    },
    messages: [
      {
        id: "2-1",
        role: "user",
        parts: [
          {
            type: "text",
            text: "Summarize what I've saved about building a good design system.",
          },
        ],
      },
      {
        id: "2-2",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "From your saved articles on design systems, the recurring themes are:\n\n**1. Tokens before components**\nStart with design tokens — colors, spacing, typography scales — before building any UI components. They're the foundation everything else inherits from.\n\n**2. Components should be headless first**\nSeparate behavior from presentation. Headless components give teams flexibility without sacrificing consistency.\n\n**3. Documentation is the product**\nA design system without clear usage examples and rationale gets abandoned. Treat the docs as a first-class deliverable.",
          },
        ],
      },
    ],
  },
  {
    id: "3",
    title: "Productivity reading list",
    historyItem: {
      id: "3",
      title: "Productivity reading list",
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    },
    messages: [
      {
        id: "3-1",
        role: "user",
        parts: [
          {
            type: "text",
            text: "What productivity strategies came up most in the videos and articles I saved?",
          },
        ],
      },
      {
        id: "3-2",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Across your saved productivity content, three strategies appear consistently:\n\n**1. Time blocking over to-do lists**\nScheduling tasks into calendar blocks reduces decision fatigue and makes commitments concrete rather than aspirational.\n\n**2. Single-tasking is faster**\nMultiple sources cite research showing context-switching costs 20–40% of productive time. Deep focus sessions consistently outperform multitasking.\n\n**3. Energy management over time management**\nThe most effective approach isn't squeezing more hours — it's matching high-energy windows to high-leverage work.",
          },
        ],
      },
    ],
  },
];

interface PreviewChatHeaderProps {
  activeChat: DemoChat;
  onSelectChat: (id: string) => void;
}

function PreviewChatHeader({
  activeChat,
  onSelectChat,
}: PreviewChatHeaderProps) {
  return (
    <div className="flex w-full justify-between items-center gap-2 px-4 py-3 border-b border-border shrink-0">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        <div className="flex shrink-0 items-center gap-1">
          <Logo size={18} />
          <Button variant="ghost" size="sm" className="pointer-events-none">
            <Typography
              component="span"
              size="small"
              className="text-accent-foreground font-medium"
            >
              Purl AI
            </Typography>
          </Button>
        </div>
        <Typography
          component="span"
          size="small"
          className="shrink-0 text-muted-foreground font-medium"
        >
          /
        </Typography>
        <ChatHistory
          chats={DEMO_CHATS.map((c) => c.historyItem)}
          isLoading={false}
          onSelectChat={onSelectChat}
        >
          <Button
            variant="ghost"
            size="sm"
            className="max-w-full shrink gap-1 overflow-hidden cursor-pointer"
          >
            <span className="min-w-0 truncate">{activeChat.title}</span>
            <ChevronDown className="shrink-0" />
          </Button>
        </ChatHistory>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="icon-sm" className="pointer-events-none">
          <Plus />
        </Button>
        <Button variant="ghost" size="icon-sm" className="pointer-events-none">
          <Ellipsis />
        </Button>
      </div>
    </div>
  );
}

function PreviewChatInner() {
  const [activeChatId, setActiveChatId] = useState(DEMO_CHATS[0].id);
  const activeChat =
    DEMO_CHATS.find((c) => c.id === activeChatId) ?? DEMO_CHATS[0];

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col items-start justify-start h-[560px]">
      <PreviewChatHeader
        activeChat={activeChat}
        onSelectChat={setActiveChatId}
      />

      <div className="flex flex-col flex-1 min-h-0 w-full p-4 md:p-0">
        <ChatArea
          messages={activeChat.messages}
          isLoading={false}
          autoScroll={false}
          onSuggestion={() => undefined}
        />

        <ChatInput
          input=""
          onInputChange={() => undefined}
          onSubmit={() => undefined}
          isLoading={false}
          disabled
        />
      </div>
    </div>
  );
}

export default function PreviewChat() {
  return (
    <ChatProvider>
      <PreviewChatInner />
    </ChatProvider>
  );
}
