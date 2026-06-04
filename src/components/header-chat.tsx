"use client";

import { ChevronDown, Ellipsis, Plus } from "lucide-react";
import Link from "next/link";
import { ChatHistory } from "./chat/chat-history";
import { Logo } from "./logo";
import { TooltipWrapper } from "./tooltip-wrapper";
import { Typography } from "./typography";
import { Button } from "./ui/button";

export default function HeaderChat() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 transform-none">
      <div className="w-full flex justify-between items-center p-4 bg-linear-to-b from-background to-transparent">
        <div className="flex items-center justify-start gap-1">
          <div className="flex items-center justify-start gap-1">
            <Logo size={18} />
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              asChild
            >
              <Link href="/ai">
                <Typography
                  component="span"
                  size="small"
                  className="text-accent-foreground font-medium"
                >
                  Purl AI
                </Typography>
              </Link>
            </Button>
          </div>
          <Typography
            component="span"
            size="small"
            className="text-muted-foreground font-medium"
          >
            /
          </Typography>
          <ChatHistory
            chats={[]}
            isLoading={false}
            onSelectChat={() => {}}
            onOpenChange={() => {}}
          >
            <Button variant="ghost" size="sm" className="cursor-pointer">
              New chat <ChevronDown />
            </Button>
          </ChatHistory>
        </div>

        <div className="flex items-center justify-end gap-2">
          <TooltipWrapper content="New chat">
            <Button variant="ghost" size="icon-sm" className="cursor-pointer">
              <Plus />
            </Button>
          </TooltipWrapper>
          <TooltipWrapper content="More options">
            <Button variant="ghost" size="icon-sm" className="cursor-pointer">
              <Ellipsis />
            </Button>
          </TooltipWrapper>
        </div>
      </div>
    </header>
  );
}
