"use client";

import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
import { MessageCircle } from "lucide-react";

const ChatWidget = dynamic(() => import("@/components/chat/chat-widget"), {
  ssr: false,
  loading: () => (
    <Button
      size="icon-lg"
      variant="default"
      className="cursor-pointer rounded-full"
      aria-label="Open chat"
    >
      <MessageCircle />
    </Button>
  ),
});

export function HomeChatWidget() {
  return <ChatWidget />;
}
